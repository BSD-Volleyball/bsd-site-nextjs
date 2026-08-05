/**
 * log-retention.ts — nightly prune of notification_log.
 *
 * Every outbound message now writes a row (src/lib/email/send.ts), so a
 * league-wide broadcast alone adds ~2,000. A year is long enough to answer
 * "did they get it?" for anything anyone still asks about — the previous
 * season plus the current one — and short enough that the table does not
 * grow without bound.
 *
 * Deleting a year-old row cannot resurrect a send: dedupe keys embed the
 * date they were issued for (`match-123-2026-08-01`), so a key old enough to
 * be pruned can never be generated again.
 */

import "server-only"

import { inArray, lt } from "drizzle-orm"

import { db } from "@/database/db"
import { notificationLog } from "@/database/schema"
import { logger } from "@/lib/logger"
import { NOTIFICATION_LOG_RETENTION_DAYS } from "./types"

/**
 * Rows removed per statement. Keeps each DELETE short so the prune never
 * holds a long transaction against a table the send path writes to.
 */
const DEFAULT_BATCH_SIZE = 1000

/** Backstop so a bug cannot turn this into an unbounded loop. */
const MAX_BATCHES = 200

export interface PruneResult {
    /** Rows older than this were removed. */
    cutoff: string
    deleted: number
    /** True when MAX_BATCHES was hit and more rows remain for tomorrow. */
    truncated: boolean
}

export function retentionCutoff(now: Date = new Date()): Date {
    const cutoff = new Date(now)
    cutoff.setUTCDate(cutoff.getUTCDate() - NOTIFICATION_LOG_RETENTION_DAYS)
    return cutoff
}

export async function pruneNotificationLog(opts?: {
    now?: Date
    batchSize?: number
}): Promise<PruneResult> {
    const cutoff = retentionCutoff(opts?.now)
    const batchSize = opts?.batchSize ?? DEFAULT_BATCH_SIZE

    let deleted = 0
    let truncated = true

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
        // Delete by id from a bounded subquery rather than by timestamp
        // directly, so each statement touches at most batchSize rows.
        const removed = await db
            .delete(notificationLog)
            .where(
                inArray(
                    notificationLog.id,
                    db
                        .select({ id: notificationLog.id })
                        .from(notificationLog)
                        .where(lt(notificationLog.created_at, cutoff))
                        .limit(batchSize)
                )
            )
            .returning({ id: notificationLog.id })

        deleted += removed.length
        if (removed.length < batchSize) {
            truncated = false
            break
        }
    }

    const result: PruneResult = {
        cutoff: cutoff.toISOString(),
        deleted,
        truncated
    }

    if (deleted > 0 || truncated) {
        logger.info("[notifications] Pruned notification log", { ...result })
    }
    return result
}
