/**
 * backfill-broadcast-recipient-total.ts — one-off.
 *
 * email_broadcasts.recipient_total is populated at send time from 2026-07-27
 * onward. This fills it in for earlier rows where the figure can be measured
 * rather than guessed, and deliberately leaves the rest null.
 *
 * Two sources, both exact:
 *
 *   1. all_users broadcasts sent from the admin UI — the intended audience was
 *      "every user with an email", so counting users created on or before
 *      sent_at reconstructs it. This is only trustworthy when the result is
 *      >= sent_count; a smaller number means users have been deleted since and
 *      the reconstruction has drifted, so that row is skipped rather than
 *      recorded as a nonsense "1931 of 1930".
 *
 *   2. The 2026-07-27 catch-up resends (#7, #8, #9) targeted a fixed cohort
 *      from a snapshot file, not a live group, and every intended recipient was
 *      sent to (0 failed) — so recipient_total is exactly sent_count.
 *
 * Dry run (default):
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-broadcast-recipient-total.ts
 * Apply:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-broadcast-recipient-total.ts --apply
 */
import "dotenv/config"
import { Client } from "pg"

const APPLY = process.argv.includes("--apply")

/** Resends driven by scripts/resend-fall-2026-registration.ts. */
const COHORT_RESEND_IDS = [7, 8, 9]

async function main() {
    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        keepAlive: true
    })
    await c.connect()

    const { rows } = await c.query(
        `select b.id, b.sent_count, b.recipient_total, g.group_type,
                (select count(*)::int from users u
                  where u.email is not null and u.created_at <= b.sent_at) as pop_at_send
           from email_broadcasts b
           left join email_recipient_groups g on g.id = b.recipient_group_id
          where b.sent_at is not null
          order by b.id`
    )

    const planned: Array<{ id: number; total: number; basis: string }> = []
    const skipped: Array<{ id: number; why: string }> = []

    for (const r of rows) {
        if (r.recipient_total !== null) {
            skipped.push({ id: r.id, why: "already set" })
            continue
        }
        if (COHORT_RESEND_IDS.includes(r.id)) {
            planned.push({
                id: r.id,
                total: r.sent_count,
                basis: "fixed cohort resend, 0 failed"
            })
            continue
        }
        if (r.group_type !== "all_users") {
            skipped.push({
                id: r.id,
                why: `group ${r.group_type} — not measurable`
            })
            continue
        }
        if (r.pop_at_send < r.sent_count) {
            skipped.push({
                id: r.id,
                why: `pop_at_send ${r.pop_at_send} < sent ${r.sent_count} — users deleted since, reconstruction unreliable`
            })
            continue
        }
        planned.push({
            id: r.id,
            total: r.pop_at_send,
            basis: "users with email created on or before sent_at"
        })
    }

    console.log("planned:")
    for (const p of planned) {
        const row = rows.find((r) => r.id === p.id)
        console.log(`  #${p.id}  ${row.sent_count} of ${p.total}  (${p.basis})`)
    }
    console.log("skipped:")
    for (const s of skipped) console.log(`  #${s.id}  ${s.why}`)

    if (!APPLY) {
        console.log(
            `\nDRY RUN — would set recipient_total on ${planned.length} rows. Re-run with --apply.`
        )
        await c.end()
        return
    }

    for (const p of planned) {
        await c.query(
            `update email_broadcasts set recipient_total = $1 where id = $2`,
            [p.total, p.id]
        )
    }
    console.log(`\nupdated ${planned.length} rows.`)

    await c.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
