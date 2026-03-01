"use server"

import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq, or, sql } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { logAuditEntry } from "@/lib/audit-log"

export interface GoogleMembershipUser {
    id: string
    oldId: number | null
    firstName: string
    lastName: string
    preferredName: string | null
    email: string
    seasonsList: string
    notificationList: string
}

async function checkAdminAccess() {
    return isAdminOrDirectorBySession()
}

export async function getGoogleMembershipUsers(params?: {
    query?: string
    page?: number
    limit?: number
}): Promise<{
    status: boolean
    message?: string
    users: GoogleMembershipUser[]
    total: number
    page: number
    limit: number
    totalPages: number
    query: string
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            users: [],
            total: 0,
            page: 1,
            limit: 50,
            totalPages: 1,
            query: ""
        }
    }

    try {
        const query = params?.query?.trim() ?? ""
        const normalizedPage =
            Number.isInteger(params?.page) && (params?.page ?? 0) > 0
                ? (params?.page as number)
                : 1
        const normalizedLimit =
            Number.isInteger(params?.limit) && (params?.limit ?? 0) > 0
                ? Math.min(params?.limit as number, 200)
                : 50
        const whereClause =
            query.length >= 2
                ? or(
                      sql`CAST(${users.old_id} AS TEXT) LIKE ${`%${query}%`}`,
                      sql`LOWER(${users.first_name}) LIKE ${`%${query.toLowerCase()}%`}`,
                      sql`LOWER(${users.last_name}) LIKE ${`%${query.toLowerCase()}%`}`,
                      sql`LOWER(${users.preffered_name}) LIKE ${`%${query.toLowerCase()}%`}`,
                      sql`LOWER(${users.email}) LIKE ${`%${query.toLowerCase()}%`}`
                  )
                : undefined

        const [countResult] = whereClause
            ? await db
                  .select({ count: sql<number>`count(*)` })
                  .from(users)
                  .where(whereClause)
            : await db.select({ count: sql<number>`count(*)` }).from(users)

        const total = Number(countResult.count)
        const totalPages = Math.max(1, Math.ceil(total / normalizedLimit))
        const effectivePage = Math.min(normalizedPage, totalPages)
        const offset = (effectivePage - 1) * normalizedLimit

        const allUsers = whereClause
            ? await db
                  .select({
                      id: users.id,
                      oldId: users.old_id,
                      firstName: users.first_name,
                      lastName: users.last_name,
                      preferredName: users.preffered_name,
                      email: users.email,
                      seasonsList: users.seasons_list,
                      notificationList: users.notification_list
                  })
                  .from(users)
                  .where(whereClause)
                  .orderBy(users.last_name, users.first_name)
                  .limit(normalizedLimit)
                  .offset(offset)
            : await db
                  .select({
                      id: users.id,
                      oldId: users.old_id,
                      firstName: users.first_name,
                      lastName: users.last_name,
                      preferredName: users.preffered_name,
                      email: users.email,
                      seasonsList: users.seasons_list,
                      notificationList: users.notification_list
                  })
                  .from(users)
                  .orderBy(users.last_name, users.first_name)
                  .limit(normalizedLimit)
                  .offset(offset)

        return {
            status: true,
            users: allUsers,
            total,
            page: effectivePage,
            limit: normalizedLimit,
            totalPages,
            query
        }
    } catch (error) {
        console.error("Error loading Google Membership users:", error)
        return {
            status: false,
            message: "Failed to load users.",
            users: [],
            total: 0,
            page: 1,
            limit: 50,
            totalPages: 1,
            query: ""
        }
    }
}

export async function updateGoogleMembership(
    userId: string,
    values: {
        seasonsList: string
        notificationList: string
    }
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        await db
            .update(users)
            .set({
                seasons_list: values.seasonsList,
                notification_list: values.notificationList,
                updatedAt: new Date()
            })
            .where(eq(users.id, userId))

        const session = await auth.api.getSession({ headers: await headers() })

        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "users",
                entityId: userId,
                summary: `Admin updated Google membership flags for ${userId} (seasons_list=${values.seasonsList}, notification_list=${values.notificationList})`
            })
        }

        return { status: true, message: "Membership fields updated." }
    } catch (error) {
        console.error("Error updating Google Membership fields:", error)
        return { status: false, message: "Failed to update membership fields." }
    }
}
