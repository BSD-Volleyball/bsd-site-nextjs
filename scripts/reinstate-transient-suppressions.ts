/**
 * reinstate-transient-suppressions.ts — one-off.
 *
 * Clears the remaining suppression rows whose reason is temporary rather than
 * permanent (SoftBounce, Transient, Blocked). The pre-fix webhook recorded a
 * suppression for every bounce type, and filterSuppressed() treats any row as
 * permanent — so a full mailbox or a momentary greylist removed a member from
 * every future broadcast, forever.
 *
 * isPermanentBounceType() now prevents new rows like these. This clears the
 * backlog left behind. Postmark holds none of these addresses on its own
 * broadcast-stream suppression list (it only auto-suppresses HardBounce and
 * SpamComplaint), so no matching change is needed there.
 *
 * Anyone who *also* carries a genuinely permanent suppression is left alone.
 *
 * Dry run (default):
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/reinstate-transient-suppressions.ts
 * Apply:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/reinstate-transient-suppressions.ts --apply
 */
import "dotenv/config"
import { mkdirSync, writeFileSync } from "node:fs"
import { Client } from "pg"

const OUT = "scripts/data/transient-suppressions.json"
const APPLY = process.argv.includes("--apply")

// Mirrors isPermanentBounceType() in src/lib/postmark.ts — anything not on the
// permanent list should never have produced a suppression row.
const TRANSIENT_REASONS = ["SoftBounce", "Transient", "Blocked"]

async function main() {
    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        keepAlive: true
    })
    await c.connect()

    const { rows } = await c.query(
        `select s.id as suppression_id, s.email, s.user_id, s.stream_id,
                s.reason, s.origin, s.suppressed_at, u.first_name, u.last_name,
                u.email_status
           from email_suppressions s
           left join users u on u.id = s.user_id
          where s.reason = any($1::text[])
            and not exists (
              select 1 from email_suppressions p
               where lower(p.email) = lower(s.email)
                 and p.reason in ('HardBounce', 'SpamComplaint', 'ManualSuppression'))
          order by s.reason, lower(s.email)`,
        [TRANSIENT_REASONS]
    )

    mkdirSync("scripts/data", { recursive: true })
    writeFileSync(
        OUT,
        JSON.stringify(
            {
                capturedAt: new Date().toISOString(),
                reasons: TRANSIENT_REASONS,
                note: "Temporary delivery failures wrongly recorded as permanent suppressions",
                totals: { eligible: rows.length },
                eligible: rows
            },
            null,
            2
        )
    )

    const deliverable = async () => {
        const { rows: r } = await c.query(
            `select count(*)::int as n from users u
              where u.email is not null
                and lower(u.email) not in (
                  select lower(s.email) from email_suppressions s
                   where s.stream_id = 'broadcast')`
        )
        return r[0].n as number
    }

    const before = await deliverable()
    console.log(`eligible transient rows:    ${rows.length}`)
    console.log(`deliverable "Everyone" now: ${before}`)
    console.log(`wrote ${OUT}`)

    if (!APPLY) {
        console.log(
            `\nDRY RUN — would delete ${rows.length} rows. Re-run with --apply.`
        )
        await c.end()
        return
    }

    const { rowCount } = await c.query(
        `delete from email_suppressions where id = any($1::int[])`,
        [rows.map((r) => r.suppression_id)]
    )
    const after = await deliverable()
    console.log(`\ndeleted:                    ${rowCount}`)
    console.log(`deliverable "Everyone" now: ${after}  (+${after - before})`)

    await c.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
