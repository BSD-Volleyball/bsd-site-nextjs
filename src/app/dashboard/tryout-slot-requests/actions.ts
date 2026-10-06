"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { tryoutSlotRequests } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"
import { getSeasonConfig } from "@/lib/site-config"

interface SlotSelection {
    week: number
    canSlot1: boolean
    canSlot2: boolean
    canSlot3: boolean
}

function validateSlotSelection(data: SlotSelection): string | null {
    if (![1, 2, 3].includes(data.week)) {
        return "Tryout week must be 1, 2, or 3."
    }

    if (data.week === 1 && data.canSlot3) {
        return "Week 1 only has 2 sessions."
    }

    if (!data.canSlot1 && !data.canSlot2 && !data.canSlot3) {
        return "Select at least one time slot the player can attend."
    }

    return null
}

export const createTryoutSlotRequest = withAction(
    async (data: {
        userId: string
        week: number
        canSlot1: boolean
        canSlot2: boolean
        canSlot3: boolean
        comment: string | null
    }): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        if (!data.userId) {
            return fail("Select a player.")
        }

        const validationError = validateSlotSelection(data)
        if (validationError) {
            return fail(validationError)
        }

        try {
            const config = await getSeasonConfig()
            if (!config.seasonId) {
                return fail("No current season found.")
            }

            const [existing] = await db
                .select({ id: tryoutSlotRequests.id })
                .from(tryoutSlotRequests)
                .where(
                    and(
                        eq(tryoutSlotRequests.season, config.seasonId),
                        eq(tryoutSlotRequests.user_id, data.userId),
                        eq(tryoutSlotRequests.week, data.week)
                    )
                )
                .limit(1)

            if (existing) {
                return fail(
                    "A request already exists for this player and week — edit it instead."
                )
            }

            const userId = await getSessionUserId()

            await db.insert(tryoutSlotRequests).values({
                season: config.seasonId,
                user_id: data.userId,
                week: data.week,
                can_slot_1: data.canSlot1,
                can_slot_2: data.canSlot2,
                can_slot_3: data.canSlot3,
                comment: data.comment?.trim() || null,
                created_by: userId
            })

            if (userId) {
                await logAuditEntry({
                    userId,
                    action: "create",
                    entityType: "tryout_slot_requests",
                    summary: `Created week ${data.week} tryout slot request for user ${data.userId}`
                })
            }

            revalidatePath("/dashboard/tryout-slot-requests")
            return ok(undefined, "Tryout slot request created.")
        } catch (error) {
            logger.error("Error creating tryout slot request", undefined, error)
            return fail("Failed to create tryout slot request.")
        }
    }
)

export const updateTryoutSlotRequest = withAction(
    async (data: {
        id: number
        canSlot1: boolean
        canSlot2: boolean
        canSlot3: boolean
        comment: string | null
    }): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const [existing] = await db
                .select({
                    id: tryoutSlotRequests.id,
                    week: tryoutSlotRequests.week
                })
                .from(tryoutSlotRequests)
                .where(eq(tryoutSlotRequests.id, data.id))
                .limit(1)

            if (!existing) {
                return fail("Tryout slot request not found.")
            }

            const validationError = validateSlotSelection({
                week: existing.week,
                canSlot1: data.canSlot1,
                canSlot2: data.canSlot2,
                canSlot3: data.canSlot3
            })
            if (validationError) {
                return fail(validationError)
            }

            await db
                .update(tryoutSlotRequests)
                .set({
                    can_slot_1: data.canSlot1,
                    can_slot_2: data.canSlot2,
                    can_slot_3: data.canSlot3,
                    comment: data.comment?.trim() || null,
                    updated_at: new Date()
                })
                .where(eq(tryoutSlotRequests.id, data.id))

            const userId = await getSessionUserId()
            if (userId) {
                await logAuditEntry({
                    userId,
                    action: "update",
                    entityType: "tryout_slot_requests",
                    entityId: data.id,
                    summary: `Updated tryout slot request #${data.id}`
                })
            }

            revalidatePath("/dashboard/tryout-slot-requests")
            return ok(undefined, "Tryout slot request updated.")
        } catch (error) {
            logger.error("Error updating tryout slot request", undefined, error)
            return fail("Failed to update tryout slot request.")
        }
    }
)

export const deleteTryoutSlotRequest = withAction(
    async (id: number): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            await db
                .delete(tryoutSlotRequests)
                .where(eq(tryoutSlotRequests.id, id))

            const userId = await getSessionUserId()
            if (userId) {
                await logAuditEntry({
                    userId,
                    action: "delete",
                    entityType: "tryout_slot_requests",
                    entityId: id,
                    summary: `Deleted tryout slot request #${id}`
                })
            }

            revalidatePath("/dashboard/tryout-slot-requests")
            return ok(undefined, "Tryout slot request deleted.")
        } catch (error) {
            logger.error("Error deleting tryout slot request", undefined, error)
            return fail("Failed to delete tryout slot request.")
        }
    }
)
