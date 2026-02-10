import { db } from "@/database/db"
import { auditLog } from "@/database/schema"

export async function logAuditEntry(params: {
    userId: string
    action: string
    entityType?: string
    entityId?: string | number
    summary: string
}): Promise<void> {
    try {
        await db.insert(auditLog).values({
            user: params.userId,
            action: params.action,
            entity_type: params.entityType ?? null,
            entity_id: params.entityId != null ? String(params.entityId) : null,
            summary: params.summary,
            created_at: new Date()
        })
    } catch (error) {
        console.error("Failed to write audit log:", error)
    }
}
