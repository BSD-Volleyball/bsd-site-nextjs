"use server"

import { formatPlayerName } from "@/lib/utils"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users, discounts } from "@/database/schema"
import { eq, desc } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { isAdminOrDirectorBySession } from "@/lib/rbac"

export type DiscountScope = "season" | "tournament"

export interface DiscountEntry {
    id: number
    userId: string
    userName: string
    percentage: string
    expiration: Date | null
    reason: string | null
    used: boolean
    scope: DiscountScope
    createdAt: Date
}

export async function getDiscounts(): Promise<{
    status: boolean
    message?: string
    discounts: DiscountEntry[]
}> {
    const hasAccess = await isAdminOrDirectorBySession()
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
                preferredName: users.preferred_name,
                percentage: discounts.percentage,
                expiration: discounts.expiration,
                reason: discounts.reason,
                used: discounts.used,
                scope: discounts.scope,
                createdAt: discounts.created_at
            })
            .from(discounts)
            .innerJoin(users, eq(discounts.user, users.id))
            .orderBy(desc(discounts.created_at))

        const entries: DiscountEntry[] = rows.map((row) => {
            const scope: DiscountScope =
                row.scope === "tournament" ? "tournament" : "season"
            return {
                id: row.id,
                userId: row.userId,
                userName: formatPlayerName(
                    row.firstName,
                    row.lastName,
                    row.preferredName
                ),
                percentage: row.percentage || "0",
                expiration: row.expiration,
                reason: row.reason,
                used: row.used,
                scope,
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
    const hasAccess = await isAdminOrDirectorBySession()
    if (!hasAccess) {
        return []
    }

    const allUsers = await db
        .select({
            id: users.id,
            first_name: users.first_name,
            last_name: users.last_name,
            preferred_name: users.preferred_name
        })
        .from(users)
        .orderBy(users.last_name, users.first_name)

    return allUsers.map((u) => {
        return {
            id: u.id,
            name: formatPlayerName(u.first_name, u.last_name, u.preferred_name)
        }
    })
}

export async function createDiscount(data: {
    userId: string
    percentage: string
    expiration: string | null
    reason: string | null
    scope: DiscountScope
}): Promise<{ status: boolean; message: string }> {
    const hasAccess = await isAdminOrDirectorBySession()
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

        if (data.scope !== "season" && data.scope !== "tournament") {
            return { status: false, message: "Invalid discount scope." }
        }

        await db.insert(discounts).values({
            user: data.userId,
            percentage: data.percentage,
            expiration: data.expiration ? new Date(data.expiration) : null,
            reason: data.reason || null,
            used: false,
            scope: data.scope,
            created_at: new Date()
        })

        const session = await auth.api.getSession({ headers: await headers() })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "discounts",
                summary: `Created ${data.percentage}% ${data.scope} discount for user ${data.userId}${data.reason ? ` (reason: ${data.reason})` : ""}`
            })
        }

        revalidatePath("/dashboard/manage-discounts")
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
    const hasAccess = await isAdminOrDirectorBySession()
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

        revalidatePath("/dashboard/manage-discounts")
        return { status: true, message: "Discount updated successfully." }
    } catch (error) {
        console.error("Error updating discount:", error)
        return { status: false, message: "Failed to update discount." }
    }
}

export async function deleteDiscount(
    id: number
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await isAdminOrDirectorBySession()
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

        revalidatePath("/dashboard/manage-discounts")
        return { status: true, message: "Discount deleted successfully." }
    } catch (error) {
        console.error("Error deleting discount:", error)
        return { status: false, message: "Failed to delete discount." }
    }
}
