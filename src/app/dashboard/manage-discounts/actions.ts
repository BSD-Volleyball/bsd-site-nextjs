"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { discounts } from "@/database/schema"
import { eq } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"
import type { DiscountScope } from "./data"

export const createDiscount = withAction(
    async (data: {
        userId: string
        percentage: string
        expiration: string | null
        reason: string | null
        scope: DiscountScope
    }): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const percentageNum = parseFloat(data.percentage)
            if (
                Number.isNaN(percentageNum) ||
                percentageNum <= 0 ||
                percentageNum > 100
            ) {
                return fail("Percentage must be between 1 and 100.")
            }

            if (data.scope !== "season" && data.scope !== "tournament") {
                return fail("Invalid discount scope.")
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

            const userId = await getSessionUserId()
            if (userId) {
                await logAuditEntry({
                    userId,
                    action: "create",
                    entityType: "discounts",
                    summary: `Created ${data.percentage}% ${data.scope} discount for user ${data.userId}${data.reason ? ` (reason: ${data.reason})` : ""}`
                })
            }

            revalidatePath("/dashboard/manage-discounts")
            return ok(undefined, "Discount created successfully.")
        } catch (error) {
            logger.error("Error creating discount", undefined, error)
            return fail("Failed to create discount.")
        }
    }
)

export const updateDiscount = withAction(
    async (data: {
        id: number
        percentage: string
        expiration: string | null
        reason: string | null
    }): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const percentageNum = parseFloat(data.percentage)
            if (
                Number.isNaN(percentageNum) ||
                percentageNum <= 0 ||
                percentageNum > 100
            ) {
                return fail("Percentage must be between 1 and 100.")
            }

            // A discount is redeemed exactly once. Editing used to reset
            // `used`, which is how recurring comps were reissued each season,
            // but that left one row standing for several redemptions and made
            // per-season reporting impossible. Reissue by creating a new
            // discount instead.
            const [existing] = await db
                .select({ used: discounts.used })
                .from(discounts)
                .where(eq(discounts.id, data.id))

            if (!existing) {
                return fail("Discount not found.")
            }
            if (existing.used) {
                return fail(
                    "This discount has already been used and cannot be edited. Create a new discount instead."
                )
            }

            await db
                .update(discounts)
                .set({
                    percentage: data.percentage,
                    expiration: data.expiration
                        ? new Date(data.expiration)
                        : null,
                    reason: data.reason || null
                })
                .where(eq(discounts.id, data.id))

            const userId = await getSessionUserId()
            if (userId) {
                await logAuditEntry({
                    userId,
                    action: "update",
                    entityType: "discounts",
                    entityId: data.id,
                    summary: `Updated discount #${data.id} to ${data.percentage}%`
                })
            }

            revalidatePath("/dashboard/manage-discounts")
            return ok(undefined, "Discount updated successfully.")
        } catch (error) {
            logger.error("Error updating discount", undefined, error)
            return fail("Failed to update discount.")
        }
    }
)

export const deleteDiscount = withAction(
    async (id: number): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            await db.delete(discounts).where(eq(discounts.id, id))

            const userId = await getSessionUserId()
            if (userId) {
                await logAuditEntry({
                    userId,
                    action: "delete",
                    entityType: "discounts",
                    entityId: id,
                    summary: `Deleted discount #${id}`
                })
            }

            revalidatePath("/dashboard/manage-discounts")
            return ok(undefined, "Discount deleted successfully.")
        } catch (error) {
            logger.error("Error deleting discount", undefined, error)
            return fail("Failed to delete discount.")
        }
    }
)
