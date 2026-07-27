/**
 * resend-fall-2026-registration.ts — one-off.
 *
 * Re-sends broadcast #5 ("[BSD] Fall 2026 Registration is Open!!") to the
 * recipients who were wrongly suppressed by Gmail's transient 4.7.28 rate limit
 * on 2026-07-01 and therefore never received it.
 *
 * Subject and body are read verbatim from the stored email_broadcasts row, so
 * template variables are already resolved exactly as the original recipients
 * saw them — nothing is re-rendered here. The single exception is OMIT_FRAGMENT
 * below, whose removal is asserted rather than assumed.
 *
 * Safety rails:
 *   - dry run unless --apply is passed
 *   - anyone suppressed *now* (for any reason) is excluded, so hard bounces and
 *     genuine unsubscribes recorded since are respected
 *   - --limit N / --skip N for canary runs and their follow-up
 *   - delivery goes through sendBroadcastEmails, inheriting the paced batching
 *     (EMAIL_BATCH_SIZE / EMAIL_BATCH_DELAY_MS) that this incident prompted
 *   - the database is never held open across the send (see withDb)
 *
 * Must run with the react-server condition so `server-only` resolves:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx --conditions=react-server \
 *     scripts/resend-fall-2026-registration.ts [--skip 5] [--limit 5] [--apply]
 */
import "dotenv/config"
import { readFileSync, writeFileSync } from "node:fs"
import { Client } from "pg"
import { sendBroadcastEmails, resolveBatchThrottle } from "@/lib/postmark"
import { site } from "@/config/site"

const SNAPSHOT = "scripts/data/rate-limit-suppressions-2026-07-01.json"
const RESULT_FALLBACK = "scripts/data/resend-result.json"
const SOURCE_BROADCAST_ID = 5
const STREAM = "broadcast"

/**
 * Broadcast #5 opened by apologising for the mis-titled broadcast #4. These
 * recipients received neither, so the apology refers to something they never
 * saw. Removing it is the only edit made to the stored content; the exact
 * fragment is pinned here and its presence asserted, so a change to the source
 * row fails loudly instead of silently sending a different body.
 */
const OMIT_FRAGMENT =
    "<div>(Apologies, now with the proper title, growing pains of the new system)</div><div><br></div>"

const APPLY = process.argv.includes("--apply")

function numericArg(flag: string): number | null {
    const i = process.argv.indexOf(flag)
    if (i < 0) return null
    const n = Number.parseInt(process.argv[i + 1], 10)
    return Number.isFinite(n) ? n : null
}

const LIMIT = numericArg("--limit")
/**
 * Skips the first N of the stable ordering. After a `--limit 5` canary, the
 * follow-up run uses `--skip 5` so the canary recipients are not mailed twice;
 * the ORDER BY in the target query is what makes that offset reliable.
 */
const SKIP = numericArg("--skip") ?? 0

/**
 * Runs `fn` on a short-lived connection, retrying transient drops.
 *
 * The database is deliberately NOT held open across the send: one long-lived
 * connection sitting idle through the paced batches is what Neon dropped
 * mid-run. The dangerous version of that failure is a drop *after* delivery but
 * before the status update — hundreds of emails sent with no record, and no way
 * to distinguish it from "never ran" on retry.
 */
async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
    let lastErr: unknown
    for (let attempt = 1; attempt <= 3; attempt++) {
        const c = new Client({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            keepAlive: true
        })
        try {
            await c.connect()
            return await fn(c)
        } catch (err) {
            lastErr = err
            console.error(`  db attempt ${attempt}/3 failed: ${err}`)
            await new Promise((r) => setTimeout(r, 1000 * attempt))
        } finally {
            await c.end().catch(() => {})
        }
    }
    throw lastErr
}

async function main() {
    const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf-8")) as {
        eligible: Array<{ email: string }>
    }
    const snapshotEmails = [
        ...new Set(snapshot.eligible.map((r) => r.email.toLowerCase()))
    ]

    // ---- Phase 1: read everything, then release the connection ------------
    const prepared = await withDb(async (c) => {
        const { rows: broadcastRows } = await c.query(
            `select subject, html_content, lexical_content, recipient_group_id, sent_by
               from email_broadcasts where id = $1`,
            [SOURCE_BROADCAST_ID]
        )
        if (broadcastRows.length === 0) {
            throw new Error(`Broadcast #${SOURCE_BROADCAST_ID} not found.`)
        }
        const source = broadcastRows[0]

        if (!String(source.html_content).includes(OMIT_FRAGMENT)) {
            throw new Error(
                `Refusing to send: the fragment to omit was not found in broadcast #${SOURCE_BROADCAST_ID}. Stored content changed — re-check OMIT_FRAGMENT.`
            )
        }
        const htmlBody = String(source.html_content).replace(OMIT_FRAGMENT, "")

        const leftover = String(source.subject + htmlBody).match(/\[[a-z_]+\]/g)
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

        return {
            source,
            htmlBody,
            allTargets: targets.map((r) => ({ email: r.email as string }))
        }
    })

    const { source, htmlBody, allTargets } = prepared
    const skippedNoAccount = snapshotEmails.length - allTargets.length

    let recipients = allTargets.slice(SKIP)
    if (LIMIT && LIMIT > 0) recipients = recipients.slice(0, LIMIT)

    const throttle = resolveBatchThrottle()
    const chunks = Math.ceil(recipients.length / throttle.batchSize)
    const pacingSeconds = ((chunks - 1) * throttle.delayMs) / 1000

    console.log(`source broadcast:   #${SOURCE_BROADCAST_ID}`)
    console.log(`subject:            ${source.subject}`)
    console.log(`snapshot addresses: ${snapshotEmails.length}`)
    console.log(`skipped (no account / now suppressed): ${skippedNoAccount}`)
    console.log(`eligible targets:   ${allTargets.length}`)
    console.log(`skipped (--skip):   ${SKIP}`)
    console.log(`recipients:         ${recipients.length}`)
    console.log(
        `pacing:             ${chunks} chunks of ${throttle.batchSize}, ${throttle.delayMs}ms apart (~${pacingSeconds}s)`
    )

    if (!APPLY) {
        console.log("\nDRY RUN — nothing sent. Re-run with --apply.")
        console.log(
            `first 5: ${recipients
                .slice(0, 5)
                .map((r) => r.email)
                .join(", ")}`
        )
        return
    }
    if (recipients.length === 0) {
        console.log("\nNo recipients — nothing to do.")
        return
    }

    // ---- Phase 2: reserve the history row before sending ------------------
    const broadcastId = await withDb(async (c) => {
        const { rows } = await c.query(
            // created_at/updated_at are NOT NULL with no DDL default — Drizzle
            // supplies defaultNow() in application code, which raw SQL bypasses.
            `insert into email_broadcasts
               (recipient_group_id, stream_id, subject, html_content,
                lexical_content, sent_by, status, created_at, updated_at)
             values ($1, $2, $3, $4, $5, $6, 'draft', now(), now())
             returning id`,
            [
                source.recipient_group_id,
                STREAM,
                source.subject,
                htmlBody,
                source.lexical_content,
                source.sent_by
            ]
        )
        return rows[0].id as number
    })
    console.log(`\nrecorded as broadcast #${broadcastId}; sending…`)

    // ---- Phase 3: send with no database connection held -------------------
    let result: { sent: number; failed: number }
    try {
        result = await sendBroadcastEmails({
            from: site.mailFrom,
            subject: source.subject,
            htmlBody,
            recipients,
            stream: STREAM,
            tag: "broadcast-resend"
        })
    } catch (err) {
        await withDb((c) =>
            c.query(
                `update email_broadcasts set status = 'failed', updated_at = now() where id = $1`,
                [broadcastId]
            )
        ).catch(() => {})
        throw err
    }
    console.log(`sent: ${result.sent}, failed: ${result.failed}`)

    // ---- Phase 4: record the outcome --------------------------------------
    // Delivery already happened. If the database is unreachable now, the result
    // must survive somewhere a human can reconcile from — losing it would make
    // a retry indistinguishable from a first run, and double-send everyone.
    try {
        await withDb((c) =>
            c.query(
                `update email_broadcasts
                    set status = 'sent', sent_count = $1, failed_count = $2,
                        sent_at = now(), updated_at = now()
                  where id = $3`,
                [result.sent, result.failed, broadcastId]
            )
        )
    } catch (err) {
        const payload = {
            broadcastId,
            sentAt: new Date().toISOString(),
            skip: SKIP,
            limit: LIMIT,
            ...result,
            recipients: recipients.map((r) => r.email)
        }
        writeFileSync(RESULT_FALLBACK, JSON.stringify(payload, null, 2))
        console.error(
            `\nEMAILS WERE SENT but the status update failed. Result written to ${RESULT_FALLBACK}. Do NOT re-run without reconciling broadcast #${broadcastId}.`
        )
        throw err
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
