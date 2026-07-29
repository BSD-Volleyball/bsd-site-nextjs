"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { withAction, ok, fail } from "@/lib/action-helpers"
import { formatPlayerName } from "@/lib/utils"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users, tryoutSlotRequests } from "@/database/schema"
import { and, asc, eq } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { getSeasonConfig } from "@/lib/site-config"

export interface TryoutSlotRequestEntry {
    id: number
    userId: string
    userName: string
    week: number
    canSlot1: boolean
    canSlot2: boolean
    canSlot3: boolean
    comment: string | null
    createdAt: Date
}

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

export async function getTryoutSlotRequests(): Promise<{
    status: boolean
    message?: string
    seasonLabel: string
    requests: TryoutSlotRequestEntry[]
}> {
    const hasAccess = await isAdminOrDirectorBySession()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            seasonLabel: "",
            requests: []
        }
    }

    try {
        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                seasonLabel: "",
                requests: []
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        const rows = await db
            .select({
                id: tryoutSlotRequests.id,
                userId: tryoutSlotRequests.user_id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                week: tryoutSlotRequests.week,
                canSlot1: tryoutSlotRequests.can_slot_1,
                canSlot2: tryoutSlotRequests.can_slot_2,
                canSlot3: tryoutSlotRequests.can_slot_3,
                comment: tryoutSlotRequests.comment,
                createdAt: tryoutSlotRequests.created_at
            })
            .from(tryoutSlotRequests)
            .innerJoin(users, eq(tryoutSlotRequests.user_id, users.id))
            .where(eq(tryoutSlotRequests.season, config.seasonId))
            .orderBy(
                asc(tryoutSlotRequests.week),
                asc(users.last_name),
                asc(users.first_name)
            )

        return {
            status: true,
            seasonLabel,
            requests: rows.map((row) => ({
                id: row.id,
                userId: row.userId,
                userName: formatPlayerName(
                    row.firstName,
                    row.lastName,
                    row.preferredName
                ),
                week: row.week,
                canSlot1: row.canSlot1,
                canSlot2: row.canSlot2,
                canSlot3: row.canSlot3,
                comment: row.comment,
                createdAt: row.createdAt
            }))
        }
    } catch (error) {
        console.error("Error fetching tryout slot requests:", error)
        return {
            status: false,
            message: "Failed to load tryout slot requests.",
            seasonLabel: "",
            requests: []
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

            const session = await auth.api.getSession({
                headers: await headers()
            })

            await db.insert(tryoutSlotRequests).values({
                season: config.seasonId,
                user_id: data.userId,
                week: data.week,
                can_slot_1: data.canSlot1,
                can_slot_2: data.canSlot2,
                can_slot_3: data.canSlot3,
                comment: data.comment?.trim() || null,
                created_by: session?.user.id ?? null
            })

            if (session) {
                await logAuditEntry({
                    userId: session.user.id,
                    action: "create",
                    entityType: "tryout_slot_requests",
                    summary: `Created week ${data.week} tryout slot request for user ${data.userId}`
                })
            }

            revalidatePath("/dashboard/tryout-slot-requests")
            return ok(undefined, "Tryout slot request created.")
        } catch (error) {
            console.error("Error creating tryout slot request:", error)
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

            const session = await auth.api.getSession({
                headers: await headers()
            })
            if (session) {
                await logAuditEntry({
                    userId: session.user.id,
                    action: "update",
                    entityType: "tryout_slot_requests",
                    entityId: data.id,
                    summary: `Updated tryout slot request #${data.id}`
                })
            }

            revalidatePath("/dashboard/tryout-slot-requests")
            return ok(undefined, "Tryout slot request updated.")
        } catch (error) {
            console.error("Error updating tryout slot request:", error)
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

            const session = await auth.api.getSession({
                headers: await headers()
            })
            if (session) {
                await logAuditEntry({
                    userId: session.user.id,
                    action: "delete",
                    entityType: "tryout_slot_requests",
                    entityId: id,
                    summary: `Deleted tryout slot request #${id}`
                })
            }

            revalidatePath("/dashboard/tryout-slot-requests")
            return ok(undefined, "Tryout slot request deleted.")
        } catch (error) {
            console.error("Error deleting tryout slot request:", error)
            return fail("Failed to delete tryout slot request.")
        }
    }
)
