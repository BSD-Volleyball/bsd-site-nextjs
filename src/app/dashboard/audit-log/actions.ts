"use server"

import { db } from "@/database/db"
import { users, auditLog } from "@/database/schema"
import { eq, desc, sql } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/lib/rbac"

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

async function checkAdminAccess(): Promise<boolean> {
    return isAdminOrDirectorBySession()
}

export async function getAuditLogs(params?: {
    offset?: number
    limit?: number
}): Promise<{
    status: boolean
    message?: string
    entries: AuditLogEntry[]
    total: number
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized", entries: [], total: 0 }
    }

    try {
        const limit = params?.limit ?? 50
        const offset = params?.offset ?? 0

        const rows = await db
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
            .offset(offset)

        const [countResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(auditLog)

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

        return {
            status: true,
            entries,
            total: Number(countResult.count)
        }
    } catch (error) {
        console.error("Error fetching audit logs:", error)
        return {
            status: false,
            message: "Failed to load audit logs.",
            entries: [],
            total: 0
        }
    }
}
