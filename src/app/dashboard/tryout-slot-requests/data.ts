import { formatSeasonLabel } from "@/lib/season-utils"
import "server-only"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { formatPlayerName } from "@/lib/utils"
import { db } from "@/database/db"
import { users, tryoutSlotRequests } from "@/database/schema"
import { asc, eq } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/next/session"
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

export const getTryoutSlotRequests = withAction(
    async (): Promise<
        ActionResult<{
            seasonLabel: string
            requests: TryoutSlotRequestEntry[]
        }>
    > => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const config = await getSeasonConfig()
            if (!config.seasonId) {
                return fail("No current season found.")
            }

            const seasonLabel = formatSeasonLabel(config)

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

            return ok({
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
            })
        } catch (error) {
            logger.error(
                "Error fetching tryout slot requests",
                undefined,
                error
            )
            return fail("Failed to load tryout slot requests.")
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
