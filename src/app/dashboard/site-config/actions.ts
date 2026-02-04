"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users, siteConfig } from "@/database/schema"
import { eq } from "drizzle-orm"

async function checkAdminAccess(): Promise<boolean> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) return false

    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)

    return user?.role === "admin" || user?.role === "director"
}

export async function getAllSiteConfig() {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized", rows: [] }
    }

    const rows = await db.select().from(siteConfig).orderBy(siteConfig.key)

    return { status: true, rows }
}

export async function updateSiteConfig(
    updates: { key: string; value: string }[]
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        for (const { key, value } of updates) {
            if (!key.trim()) continue

            await db
                .insert(siteConfig)
                .values({
                    key: key.trim(),
                    value,
                    updated_at: new Date()
                })
                .onConflictDoUpdate({
                    target: siteConfig.key,
                    set: { value, updated_at: new Date() }
                })
        }

        return { status: true, message: "Configuration updated successfully." }
    } catch (error) {
        console.error("Failed to update site config:", error)
        return {
            status: false,
            message: "Failed to update configuration."
        }
    }
}

export async function deleteSiteConfigKey(
    key: string
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        await db.delete(siteConfig).where(eq(siteConfig.key, key))

        return {
            status: true,
            message: `Removed "${key}" from configuration.`
        }
    } catch (error) {
        console.error("Failed to delete site config key:", error)
        return {
            status: false,
            message: "Failed to delete configuration key."
        }
    }
}
