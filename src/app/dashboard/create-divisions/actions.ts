"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { individual_divisions } from "@/database/schema"
import { eq } from "drizzle-orm"
import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"
import { logAuditEntry } from "@/lib/audit-log"

export type GenderSplit = "6-2" | "5-3" | "4-4"

export interface DivisionSelection {
    divisionId: number
    enabled: boolean
    teams: number
    genderSplit: GenderSplit
    coaches: boolean
}

export interface SavePayload {
    seasonId: number
    selections: DivisionSelection[]
}

export const saveDivisionSelections = withAction(
    async (payload: SavePayload): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        const { seasonId, selections } = payload

        if (!Number.isInteger(seasonId) || seasonId <= 0) {
            return fail("Invalid season.")
        }

        const enabledSelections = selections.filter((s) => s.enabled)

        for (const sel of enabledSelections) {
            if (!Number.isInteger(sel.divisionId) || sel.divisionId <= 0) {
                return fail("Invalid division id.")
            }
            if (sel.teams !== 4 && sel.teams !== 6) {
                return fail("Teams must be 4 or 6.")
            }
            if (!["6-2", "5-3", "4-4"].includes(sel.genderSplit)) {
                return fail("Invalid gender split.")
            }
        }

        try {
            await db
                .delete(individual_divisions)
                .where(eq(individual_divisions.season, seasonId))

            if (enabledSelections.length > 0) {
                await db.insert(individual_divisions).values(
                    enabledSelections.map((sel) => ({
                        season: seasonId,
                        division: sel.divisionId,
                        coaches: sel.coaches,
                        gender_split: sel.genderSplit,
                        teams: sel.teams
                    }))
                )
            }

            const userId = await getSessionUserId()
            if (userId) {
                await logAuditEntry({
                    userId,
                    action: "update",
                    entityType: "individual_divisions",
                    entityId: seasonId,
                    // Replaces every row for the season, so record the
                    // selections rather than just how many there were.
                    summary: `Saved division selections for season ${seasonId}: ${enabledSelections.length} division(s) enabled. Full selections: ${JSON.stringify(enabledSelections)}`
                })
            }

            revalidatePath("/dashboard/create-divisions")
            return ok(
                undefined,
                `Division configuration saved — ${enabledSelections.length} division(s) configured.`
            )
        } catch (error) {
            logger.error("Error saving division selections", undefined, error)
            return fail("Something went wrong. Please try again.")
        }
    }
)
