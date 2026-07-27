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
