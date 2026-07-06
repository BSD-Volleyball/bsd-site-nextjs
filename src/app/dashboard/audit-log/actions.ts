"use server"

import { db } from "@/database/db"
import { users, auditLog } from "@/database/schema"
import { eq, desc, sql } from "drizzle-orm"
import { withAction, ok, requireAdmin } from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"

export interface AuditLogEntry {
    id: number
    userId: string
    userName: string | null
    action: string
    entityType: string | null
    entityId: string | null
    summary: string
    createdAt: Date
}

export const getAuditLogs = withAction(
    async (params?: {
        offset?: number
        limit?: number
    }): Promise<ActionResult<{ entries: AuditLogEntry[]; total: number }>> => {
        await requireAdmin()

        const limit = params?.limit ?? 50
        const offset = params?.offset ?? 0

        const [rows, [countResult]] = await Promise.all([
            db
                .select({
                    id: auditLog.id,
                    userId: auditLog.user,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    action: auditLog.action,
                    entityType: auditLog.entity_type,
                    entityId: auditLog.entity_id,
                    summary: auditLog.summary,
                    createdAt: auditLog.created_at
                })
                .from(auditLog)
                .leftJoin(users, eq(auditLog.user, users.id))
                .orderBy(desc(auditLog.created_at))
                .limit(limit)
                .offset(offset),
            db.select({ count: sql<number>`count(*)` }).from(auditLog)
        ])

        const entries: AuditLogEntry[] = rows.map((row) => ({
            id: row.id,
            userId: row.userId,
            userName: row.firstName ? `${row.firstName} ${row.lastName}` : null,
            action: row.action,
            entityType: row.entityType,
            entityId: row.entityId,
            summary: row.summary,
            createdAt: row.createdAt
        }))

        return ok({ entries, total: Number(countResult.count) })
    }
)
