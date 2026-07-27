/**
 * snapshot-rate-limit-suppressions.ts — one-off, read-only.
 *
 * Captures the recipients that were suppressed by Gmail's transient 4.7.28
 * rate limit during the 2026-07-01 broadcast, before anything reinstates them.
 * Postmark reports that throttle as bounce type SpamNotification, and the
 * webhook (pre-fix) recorded it as a permanent suppression.
 *
 * Writes scripts/data/rate-limit-suppressions-2026-07-01.json (gitignored —
 * the file contains member email addresses).
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/snapshot-rate-limit-suppressions.ts
 */
import "dotenv/config"
import { writeFileSync, mkdirSync } from "node:fs"
import { Client } from "pg"

const OUT = "scripts/data/rate-limit-suppressions-2026-07-01.json"

// suppressed_at is `timestamp` (no time zone) holding UTC, which node-pg then
// re-reads as local time. Comparing against a date sidesteps that shift, and is
// exact here: every SpamNotification row in the table came from this one
// incident (Postmark confirms all 732 bounces share the 2026-07-01 broadcast).
const INCIDENT_DATE = "2026-07-01"

async function main() {
    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    await c.connect()

    const { rows } = await c.query(
        `select s.id            as suppression_id,
                s.email,
                s.user_id,
                s.stream_id,
                s.reason,
                s.origin,
                s.suppressed_at,
                u.first_name,
                u.last_name,
                u.email_status
           from email_suppressions s
           left join users u on u.id = s.user_id
          where s.reason = 'SpamNotification'
            and s.suppressed_at::date = $1::date
          order by s.suppressed_at`,
        [INCIDENT_DATE]
    )

    // Anyone carrying a second, genuinely permanent suppression must stay
    // suppressed even after this batch is cleared.
    const { rows: alsoPermanent } = await c.query(
        `select distinct lower(email) as email
           from email_suppressions
          where reason in ('HardBounce', 'SpamComplaint', 'ManualSuppression')`
    )
    const permanent = new Set(alsoPermanent.map((r) => r.email))

    const eligible = rows.filter((r) => !permanent.has(r.email.toLowerCase()))
    const held = rows.filter((r) => permanent.has(r.email.toLowerCase()))

    const snapshot = {
        capturedAt: new Date().toISOString(),
        incidentDate: INCIDENT_DATE,
        reason: "SpamNotification",
        note: "Gmail 4.7.28 transient rate limit, misrecorded as a permanent suppression",
        totals: {
            matched: rows.length,
            eligibleForReinstatement: eligible.length,
            heldBackOtherPermanentSuppression: held.length
        },
        eligible,
        heldBack: held
    }

    mkdirSync("scripts/data", { recursive: true })
    writeFileSync(OUT, JSON.stringify(snapshot, null, 2))

    console.log(`matched SpamNotification rows in window: ${rows.length}`)
    console.log(`  eligible for reinstatement:            ${eligible.length}`)
    console.log(`  held back (other permanent reason):    ${held.length}`)
    console.log(`streams: ${[...new Set(rows.map((r) => r.stream_id))].join(", ")}`)
    console.log(`wrote ${OUT}`)

    await c.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
