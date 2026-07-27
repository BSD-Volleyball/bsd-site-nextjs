/**
 * reinstate-rate-limit-suppressions.ts — one-off.
 *
 * Removes the local suppression rows created by Gmail's transient 4.7.28 rate
 * limit during the 2026-07-01 broadcast. Those recipients never opted out; the
 * pre-fix webhook recorded a temporary throttle as a permanent suppression.
 *
 * Postmark needs no matching change: its own broadcast-stream suppression list
 * never contained these addresses (it only auto-suppresses HardBounce and
 * SpamComplaint), which was verified before this script was written.
 *
 * Deletes strictly by the primary keys captured in the snapshot, so it can
 * never widen its blast radius if the table changes underneath it.
 *
 * Dry run (default):
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/reinstate-rate-limit-suppressions.ts
 * Apply:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/reinstate-rate-limit-suppressions.ts --apply
 */
import "dotenv/config"
import { readFileSync } from "node:fs"
import { Client } from "pg"

const SNAPSHOT = "scripts/data/rate-limit-suppressions-2026-07-01.json"
const APPLY = process.argv.includes("--apply")

interface SnapshotRow {
    suppression_id: number
    email: string
    reason: string
}

async function main() {
    const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf-8")) as {
        eligible: SnapshotRow[]
    }
    const ids = snapshot.eligible.map((r) => r.suppression_id)
    if (ids.length === 0) throw new Error("Snapshot contains no eligible rows.")

    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    await c.connect()

    const deliverable = async () => {
        const { rows } = await c.query(
            `select count(*)::int as n from users u
              where u.email is not null
                and lower(u.email) not in (
                  select lower(s.email) from email_suppressions s
                   where s.stream_id = 'broadcast')`
        )
        return rows[0].n as number
    }

    // Confirm the snapshot still describes reality before touching anything.
    const { rows: present } = await c.query(
        `select id, reason from email_suppressions where id = any($1::int[])`,
        [ids]
    )
    const wrongReason = present.filter((r) => r.reason !== "SpamNotification")
    if (wrongReason.length > 0) {
        throw new Error(
            `Refusing to run: ${wrongReason.length} snapshot ids no longer have reason 'SpamNotification'.`
        )
    }

    const before = await deliverable()
    console.log(`snapshot rows:              ${ids.length}`)
    console.log(`still present in table:     ${present.length}`)
    console.log(`deliverable "Everyone" now: ${before}`)

    if (!APPLY) {
        console.log(
            `\nDRY RUN — would delete ${present.length} suppression rows. Re-run with --apply.`
        )
        await c.end()
        return
    }

    const { rowCount } = await c.query(
        `delete from email_suppressions where id = any($1::int[])`,
        [ids]
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
