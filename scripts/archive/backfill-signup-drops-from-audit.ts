// Backfills signup_drops from audit_log entries written by the old
// deleteSignupEntry action (season-68 deletions predate the deleted_signups
// reason column and were only recorded in the audit log). Idempotent: rows
// whose signup_id already exists in signup_drops are skipped.
//
// Usage:
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-signup-drops-from-audit.ts --dry-run
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-signup-drops-from-audit.ts

import "dotenv/config"
import { Pool } from "pg"

const MARKER = "Full deleted signup record: "

interface LegacySignupRecord {
    id: number
    season: number
    player: string
    age: string | null
    captain: string | null
    pair: boolean | null
    // Older summaries use camelCase keys and lack ref/tryout fields.
    pairPick?: string | null
    pair_pick?: string | null
    pairReason?: string | null
    pair_reason?: string | null
    refInterest?: boolean | null
    tryoutHelp?: boolean | null
    orderId?: string | null
    amountPaid?: string | null
    createdAt?: string
}

async function backfill() {
    const dryRun = process.argv.includes("--dry-run")
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })

    // Some legacy user ids were merged away. Follow the merge audit trail
    // ("Merged user <old> into <new> (old user deleted)") to the surviving id.
    async function resolveUserId(userId: string): Promise<string | null> {
        let current = userId
        for (let hop = 0; hop < 5; hop++) {
            const exists = await pool.query(
                "SELECT 1 FROM users WHERE id = $1",
                [current]
            )
            if (exists.rowCount) return current
            const merge = await pool.query<{ summary: string }>(
                `SELECT summary FROM audit_log
                 WHERE action = 'merge' AND summary LIKE 'Merged user ' || $1 || ' into %'
                 ORDER BY created_at DESC LIMIT 1`,
                [current]
            )
            const match = merge.rows[0]?.summary.match(
                /^Merged user \S+ into (\S+)/
            )
            if (!match) return null
            current = match[1]
        }
        return null
    }

    const auditRows = await pool.query<{
        id: number
        user: string
        created_at: Date
        summary: string
    }>(
        `SELECT id, "user", created_at, summary
         FROM audit_log
         WHERE action = 'delete' AND entity_type = 'signups'
           AND summary LIKE '%' || $1 || '%'
         ORDER BY created_at`,
        [MARKER]
    )

    let inserted = 0
    let skipped = 0
    for (const row of auditRows.rows) {
        const json = row.summary.slice(
            row.summary.indexOf(MARKER) + MARKER.length
        )
        let record: LegacySignupRecord
        try {
            record = JSON.parse(json)
        } catch {
            console.warn(
                `audit #${row.id}: could not parse signup JSON (likely truncated), skipping`
            )
            skipped++
            continue
        }

        const existing = await pool.query(
            "SELECT 1 FROM signup_drops WHERE signup_id = $1",
            [record.id]
        )
        if (existing.rowCount) {
            skipped++
            continue
        }

        const playerId = await resolveUserId(record.player)
        if (!playerId) {
            console.warn(
                `audit #${row.id}: player ${record.player} no longer exists and no merge trail found, skipping`
            )
            skipped++
            continue
        }
        const droppedBy = await resolveUserId(row.user)
        if (!droppedBy) {
            console.warn(
                `audit #${row.id}: deleting admin ${row.user} no longer exists, skipping`
            )
            skipped++
            continue
        }

        const values = {
            signup_id: record.id,
            stage: "pre_draft",
            season: record.season,
            player: playerId,
            age: record.age ?? null,
            captain: record.captain ?? null,
            pair: record.pair ?? null,
            pair_pick: record.pairPick ?? record.pair_pick ?? null,
            pair_reason: record.pairReason ?? record.pair_reason ?? null,
            ref_interest: record.refInterest ?? null,
            tryout_help: record.tryoutHelp ?? null,
            order_id: record.orderId ?? null,
            amount_paid: record.amountPaid ?? null,
            created_at: record.createdAt
                ? new Date(record.createdAt)
                : row.created_at,
            reason_category: "other",
            reason_note: "(reason not recorded)",
            dropped_at: row.created_at,
            dropped_by: droppedBy
        }

        if (dryRun) {
            console.log(
                `[dry-run] would insert drop for signup ${values.signup_id} (season ${values.season}, player ${values.player}, dropped ${values.dropped_at.toISOString()})`
            )
            inserted++
            continue
        }

        await pool.query(
            `INSERT INTO signup_drops
                 (signup_id, stage, season, player, age, captain, pair,
                  pair_pick, pair_reason, ref_interest, tryout_help, order_id,
                  amount_paid, created_at, reason_category, reason_note,
                  dropped_at, dropped_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                     $14, $15, $16, $17, $18)`,
            [
                values.signup_id,
                values.stage,
                values.season,
                values.player,
                values.age,
                values.captain,
                values.pair,
                values.pair_pick,
                values.pair_reason,
                values.ref_interest,
                values.tryout_help,
                values.order_id,
                values.amount_paid,
                values.created_at,
                values.reason_category,
                values.reason_note,
                values.dropped_at,
                values.dropped_by
            ]
        )
        console.log(`inserted drop for signup ${values.signup_id}`)
        inserted++
    }

    console.log(
        `${dryRun ? "[dry-run] " : ""}done: ${inserted} inserted, ${skipped} skipped (${auditRows.rowCount} audit rows scanned)`
    )
    await pool.end()
}

backfill().catch((error) => {
    console.error(error)
    process.exit(1)
})
