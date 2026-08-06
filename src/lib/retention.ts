/**
 * retention.ts — nightly prune of the two append-only history tables.
 *
 * `notification_log` gets a row for every outbound message (see
 * src/lib/email/send.ts), so a league-wide broadcast alone adds ~2,000.
 * `audit_log` gets one for every administrative mutation. Neither is ever
 * updated, so without a prune both grow forever.
 *
 * One year is the window for both: it covers the previous season plus the
 * current one, which is as far back as anyone asks "did they get it?" or
 * "who changed this?".
 *
 * Note this is a real trade for the audit log specifically — it is the only
 * forensic record of admin actions, and availability payloads were added to
 * it so a repeat of the 2026-08-05 wipe could be reconstructed. That
 * reconstruction is possible for a year, not indefinitely.
 *
 * Pruning a `claimed` notification row is safe: dedupe keys embed the date
 * they were issued for (`match-123-2026-08-01`), so a key old enough to be
 * pruned can never be generated again.
 */

import "server-only"

import { inArray, lt } from "drizzle-orm"

import { db } from "@/database/db"
import { auditLog, notificationLog } from "@/database/schema"
import { logger } from "@/lib/logger"
import { RETENTION_DAYS } from "@/lib/retention-policy"

export { RETENTION_DAYS }

/**
 * Rows removed per statement. Keeps each DELETE short so a prune never holds
 * a long transaction against tables the app writes to constantly.
 */
const DEFAULT_BATCH_SIZE = 1000

/** Backstop so a bug cannot turn this into an unbounded loop. */
const MAX_BATCHES = 200

export interface PruneResult {
    deleted: number
    /** True when MAX_BATCHES was hit and more rows remain for tomorrow. */
    truncated: boolean
}

export interface PruneRunResult {
    /** Rows older than this were removed. */
    cutoff: string
    notificationLog: PruneResult
    auditLog: PruneResult
}

export function retentionCutoff(now: Date = new Date()): Date {
    const cutoff = new Date(now)
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS)
    return cutoff
}

interface PruneOptions {
    now?: Date
    batchSize?: number
}

/**
 * Runs `deleteBatch` until it clears fewer rows than it asked for, which
 * means the table is drained. Each table supplies its own closure so the
 * Drizzle types stay concrete.
 */
async function drain(
    batchSize: number,
    deleteBatch: (limit: number) => Promise<number>
): Promise<PruneResult> {
    let deleted = 0
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const removed = await deleteBatch(batchSize)
        deleted += removed
        if (removed < batchSize) return { deleted, truncated: false }
    }
    return { deleted, truncated: true }
}

export async function pruneNotificationLog(
    opts?: PruneOptions
): Promise<PruneResult> {
    const cutoff = retentionCutoff(opts?.now)
    return drain(opts?.batchSize ?? DEFAULT_BATCH_SIZE, async (limit) => {
        // Delete by id from a bounded subquery rather than by timestamp
        // directly, so each statement touches at most `limit` rows.
        const removed = await db
            .delete(notificationLog)
            .where(
                inArray(
                    notificationLog.id,
                    db
                        .select({ id: notificationLog.id })
                        .from(notificationLog)
                        .where(lt(notificationLog.created_at, cutoff))
                        .limit(limit)
                )
            )
            .returning({ id: notificationLog.id })
        return removed.length
    })
}

export async function pruneAuditLog(opts?: PruneOptions): Promise<PruneResult> {
    const cutoff = retentionCutoff(opts?.now)
    return drain(opts?.batchSize ?? DEFAULT_BATCH_SIZE, async (limit) => {
        const removed = await db
            .delete(auditLog)
            .where(
                inArray(
                    auditLog.id,
                    db
                        .select({ id: auditLog.id })
                        .from(auditLog)
                        .where(lt(auditLog.created_at, cutoff))
                        .limit(limit)
                )
            )
            .returning({ id: auditLog.id })
        return removed.length
    })
}

/**
 * Prunes both tables. The audit log runs even if the notification log throws,
 * so one failing table cannot quietly stop the other from ever being pruned.
 */
export async function pruneExpiredRecords(
    opts?: PruneOptions
): Promise<PruneRunResult> {
    const cutoff = retentionCutoff(opts?.now)
    const empty: PruneResult = { deleted: 0, truncated: false }

    let notifications = empty
    try {
        notifications = await pruneNotificationLog(opts)
    } catch (error) {
        logger.error("[retention] notification_log prune failed", {
            error: error instanceof Error ? error.message : String(error)
        })
    }

    let audit = empty
    try {
        audit = await pruneAuditLog(opts)
    } catch (error) {
        logger.error("[retention] audit_log prune failed", {
            error: error instanceof Error ? error.message : String(error)
        })
    }

    const result: PruneRunResult = {
        cutoff: cutoff.toISOString(),
        notificationLog: notifications,
        auditLog: audit
    }

    if (
        notifications.deleted > 0 ||
        audit.deleted > 0 ||
        notifications.truncated ||
        audit.truncated
    ) {
        logger.info("[retention] Prune complete", {
            cutoff: result.cutoff,
            notificationsDeleted: notifications.deleted,
            auditDeleted: audit.deleted,
            truncated: notifications.truncated || audit.truncated
        })
    }
    return result
}
