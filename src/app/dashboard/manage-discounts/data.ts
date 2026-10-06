import "server-only"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { formatPlayerName } from "@/lib/utils"
import { db } from "@/database/db"
import { users, discounts } from "@/database/schema"
import { eq, desc } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/next/session"

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

export const getDiscounts = withAction(
    async (): Promise<ActionResult<DiscountEntry[]>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
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

            return ok(entries)
        } catch (error) {
            logger.error("Error fetching discounts", undefined, error)
            return fail("Failed to load discounts.")
        }
    }
)

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
