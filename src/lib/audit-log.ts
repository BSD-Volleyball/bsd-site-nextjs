import { and, eq, gt, like, sql } from "drizzle-orm"
import { db, type DbExecutor } from "@/database/db"
import { auditLog } from "@/database/schema"
import { logger } from "@/lib/logger"

export async function logAuditEntry(
    params: {
        userId: string
        action: string
        entityType?: string
        entityId?: string | number
        summary: string
    },
    executor: DbExecutor = db
): Promise<void> {
    try {
        await executor.insert(auditLog).values({
            user: params.userId,
            action: params.action,
            entity_type: params.entityType ?? null,
            entity_id: params.entityId != null ? String(params.entityId) : null,
            summary: params.summary,
            created_at: new Date()
        })
    } catch (error) {
        logger.error(
            "Failed to write audit log",
            { action: params.action, userId: params.userId },
            error
        )
    }
}

/**
 * How many matching entries were written in the last `withinMinutes`. The
 * audit log is the record of who did what and when, so it also serves as the
 * throttle for actions that send mail or must not be repeated in a burst,
 * without a table of their own. The window is computed in SQL against the
 * same clock the rows were stamped with.
 */
export async function countRecentAuditEntries(params: {
    userId?: string
    action: string
    entityType?: string
    entityId?: string | number
    summaryPrefix?: string
    withinMinutes: number
}): Promise<number> {
    const conditions = [
        eq(auditLog.action, params.action),
        gt(
            auditLog.created_at,
            sql`now() - make_interval(mins => ${params.withinMinutes})`
        )
    ]
    if (params.userId) conditions.push(eq(auditLog.user, params.userId))
    if (params.entityType) {
        conditions.push(eq(auditLog.entity_type, params.entityType))
    }
    if (params.entityId != null) {
        conditions.push(eq(auditLog.entity_id, String(params.entityId)))
    }
    if (params.summaryPrefix) {
        conditions.push(like(auditLog.summary, `${params.summaryPrefix}%`))
    }
    const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(auditLog)
        .where(and(...conditions))
    return row?.n ?? 0
}
