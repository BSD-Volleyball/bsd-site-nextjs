"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users, discounts } from "@/database/schema"
import { eq, desc } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { isAdminOrDirectorBySession } from "@/lib/rbac"

export interface DiscountEntry {
    id: number
    userId: string
    userName: string
    percentage: string
    expiration: Date | null
    reason: string | null
    used: boolean
    createdAt: Date
}

async function checkAdminAccess(): Promise<boolean> {
    return isAdminOrDirectorBySession()
}

export async function getDiscounts(): Promise<{
    status: boolean
    message?: string
    discounts: DiscountEntry[]
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized", discounts: [] }
    }

    try {
        const rows = await db
            .select({
                id: discounts.id,
                userId: discounts.user,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name,
                percentage: discounts.percentage,
                expiration: discounts.expiration,
                reason: discounts.reason,
                used: discounts.used,
                createdAt: discounts.created_at
            })
            .from(discounts)
            .innerJoin(users, eq(discounts.user, users.id))
            .orderBy(desc(discounts.created_at))

        const entries: DiscountEntry[] = rows.map((row) => {
            const preferred = row.preferredName ? ` (${row.preferredName})` : ""
            return {
                id: row.id,
                userId: row.userId,
                userName: `${row.firstName}${preferred} ${row.lastName}`,
                percentage: row.percentage || "0",
                expiration: row.expiration,
                reason: row.reason,
                used: row.used,
                createdAt: row.createdAt
            }
        })

        return { status: true, discounts: entries }
    } catch (error) {
        console.error("Error fetching discounts:", error)
        return {
            status: false,
            message: "Failed to load discounts.",
            discounts: []
        }
    }
}

export async function getUsers(): Promise<{ id: string; name: string }[]> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return []
    }

    const allUsers = await db
        .select({
            id: users.id,
            first_name: users.first_name,
            last_name: users.last_name,
            preffered_name: users.preffered_name
        })
        .from(users)
        .orderBy(users.last_name, users.first_name)

    return allUsers.map((u) => {
        const preferredPart = u.preffered_name ? ` (${u.preffered_name})` : ""
        return {
            id: u.id,
            name: `${u.first_name}${preferredPart} ${u.last_name}`
        }
    })
}

export async function createDiscount(data: {
    userId: string
    percentage: string
    expiration: string | null
    reason: string | null
}): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        const percentageNum = parseFloat(data.percentage)
        if (
            Number.isNaN(percentageNum) ||
            percentageNum <= 0 ||
            percentageNum > 100
        ) {
            return {
                status: false,
                message: "Percentage must be between 1 and 100."
            }
        }

        await db.insert(discounts).values({
            user: data.userId,
            percentage: data.percentage,
            expiration: data.expiration ? new Date(data.expiration) : null,
            reason: data.reason || null,
            used: false,
            created_at: new Date()
        })

        const session = await auth.api.getSession({ headers: await headers() })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "discounts",
                summary: `Created ${data.percentage}% discount for user ${data.userId}${data.reason ? ` (reason: ${data.reason})` : ""}`
            })
        }

        return { status: true, message: "Discount created successfully." }
    } catch (error) {
        console.error("Error creating discount:", error)
        return { status: false, message: "Failed to create discount." }
    }
}

export async function updateDiscount(data: {
    id: number
    percentage: string
    expiration: string | null
    reason: string | null
}): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        const percentageNum = parseFloat(data.percentage)
        if (
            Number.isNaN(percentageNum) ||
            percentageNum <= 0 ||
            percentageNum > 100
        ) {
            return {
                status: false,
                message: "Percentage must be between 1 and 100."
            }
        }

        await db
            .update(discounts)
            .set({
                percentage: data.percentage,
                expiration: data.expiration ? new Date(data.expiration) : null,
                reason: data.reason || null,
                used: false
            })
            .where(eq(discounts.id, data.id))

        const session = await auth.api.getSession({ headers: await headers() })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "discounts",
                entityId: data.id,
                summary: `Updated discount #${data.id} to ${data.percentage}%`
            })
        }

        return { status: true, message: "Discount updated successfully." }
    } catch (error) {
        console.error("Error updating discount:", error)
        return { status: false, message: "Failed to update discount." }
    }
}

export async function deleteDiscount(
    id: number
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        await db.delete(discounts).where(eq(discounts.id, id))

        const session = await auth.api.getSession({ headers: await headers() })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "delete",
                entityType: "discounts",
                entityId: id,
                summary: `Deleted discount #${id}`
            })
        }

        return { status: true, message: "Discount deleted successfully." }
    } catch (error) {
        console.error("Error deleting discount:", error)
        return { status: false, message: "Failed to delete discount." }
    }
}
