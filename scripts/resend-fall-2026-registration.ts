/**
 * resend-fall-2026-registration.ts — one-off.
 *
 * Re-sends broadcast #5 ("[BSD] Fall 2026 Registration is Open!!") to the
 * recipients who were wrongly suppressed by Gmail's transient 4.7.28 rate limit
 * on 2026-07-01 and therefore never received it.
 *
 * Subject and body are read verbatim from the stored email_broadcasts row, so
 * template variables are already resolved exactly as the original recipients
 * saw them — nothing is re-rendered here.
 *
 * Safety rails:
 *   - dry run unless --apply is passed
 *   - anyone suppressed *now* (for any reason) is excluded, so hard bounces and
 *     genuine unsubscribes recorded since are respected
 *   - --limit N sends to the first N only, for a canary run
 *   - delivery goes through sendBroadcastEmails, inheriting the paced batching
 *     (EMAIL_BATCH_SIZE / EMAIL_BATCH_DELAY_MS) that this incident prompted
 *
 * Must run with the react-server condition so `server-only` resolves:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx --conditions=react-server \
 *     scripts/resend-fall-2026-registration.ts [--limit 5] [--apply]
 */
import "dotenv/config"
import { readFileSync } from "node:fs"
import { Client } from "pg"
import { sendBroadcastEmails, resolveBatchThrottle } from "@/lib/postmark"
import { site } from "@/config/site"

const SNAPSHOT = "scripts/data/rate-limit-suppressions-2026-07-01.json"
const SOURCE_BROADCAST_ID = 5
const STREAM = "broadcast"

const APPLY = process.argv.includes("--apply")
const limitArg = process.argv.indexOf("--limit")
const LIMIT =
    limitArg >= 0 ? Number.parseInt(process.argv[limitArg + 1], 10) : null

async function main() {
    const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf-8")) as {
        eligible: Array<{ email: string }>
    }
    const snapshotEmails = [
        ...new Set(snapshot.eligible.map((r) => r.email.toLowerCase()))
    ]

    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    await c.connect()

    const { rows: broadcastRows } = await c.query(
        `select subject, html_content, lexical_content, recipient_group_id, sent_by
           from email_broadcasts where id = $1`,
        [SOURCE_BROADCAST_ID]
    )
    if (broadcastRows.length === 0) {
        throw new Error(`Broadcast #${SOURCE_BROADCAST_ID} not found.`)
    }
    const source = broadcastRows[0]

    const leftover = String(source.subject + source.html_content).match(
        /\[[a-z_]+\]/g
    )
    if (leftover) {
        throw new Error(
            `Refusing to send: unresolved template variables ${[...new Set(leftover)].join(", ")}`
        )
    }

    // Current users only, minus anyone suppressed on this stream today.
    const { rows: targets } = await c.query(
        `select u.email
           from users u
          where lower(u.email) = any($1::text[])
            and u.email is not null
            and lower(u.email) not in (
              select lower(s.email) from email_suppressions s
               where s.stream_id = $2)
          order by lower(u.email)`,
        [snapshotEmails, STREAM]
    )

    let recipients = targets.map((r) => ({ email: r.email as string }))
    const skippedNoAccount = snapshotEmails.length - recipients.length
    if (LIMIT && LIMIT > 0) recipients = recipients.slice(0, LIMIT)

    const throttle = resolveBatchThrottle()
    const chunks = Math.ceil(recipients.length / throttle.batchSize)
    const pacingSeconds = ((chunks - 1) * throttle.delayMs) / 1000

    console.log(`source broadcast:   #${SOURCE_BROADCAST_ID}`)
    console.log(`subject:            ${source.subject}`)
    console.log(`snapshot addresses: ${snapshotEmails.length}`)
    console.log(`skipped (no account / now suppressed): ${skippedNoAccount}`)
    console.log(`recipients:         ${recipients.length}`)
    console.log(
        `pacing:             ${chunks} chunks of ${throttle.batchSize}, ${throttle.delayMs}ms apart (~${pacingSeconds}s)`
    )

    if (!APPLY) {
        console.log("\nDRY RUN — nothing sent. Re-run with --apply.")
        console.log(`first 5: ${recipients.slice(0, 5).map((r) => r.email).join(", ")}`)
        await c.end()
        return
    }

    // Record the resend as its own broadcast so it appears in history.
    const { rows: inserted } = await c.query(
        `insert into email_broadcasts
           (recipient_group_id, stream_id, subject, html_content, lexical_content,
            sent_by, status)
         values ($1, $2, $3, $4, $5, $6, 'draft')
         returning id`,
        [
            source.recipient_group_id,
            STREAM,
            source.subject,
            source.html_content,
            source.lexical_content,
            source.sent_by
        ]
    )
    const broadcastId = inserted[0].id as number
    console.log(`\nrecorded as broadcast #${broadcastId}; sending…`)

    try {
        const result = await sendBroadcastEmails({
            from: site.mailFrom,
            subject: source.subject,
            htmlBody: source.html_content,
            recipients,
            stream: STREAM,
            tag: "broadcast-resend"
        })

        await c.query(
            `update email_broadcasts
                set status = 'sent', sent_count = $1, failed_count = $2,
                    sent_at = now(), updated_at = now()
              where id = $3`,
            [result.sent, result.failed, broadcastId]
        )
        console.log(`sent: ${result.sent}, failed: ${result.failed}`)
    } catch (err) {
        await c.query(
            `update email_broadcasts set status = 'failed', updated_at = now() where id = $1`,
            [broadcastId]
        )
        throw err
    }

    await c.end()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
