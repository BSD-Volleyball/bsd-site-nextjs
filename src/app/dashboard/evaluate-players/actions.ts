"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { evaluations, divisions } from "@/database/schema"
import { eq, and, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"
import { isAdminOrDirectorBySession } from "@/next/session"

export const saveEvaluations = withAction(
    async (
        data: { playerId: string; division: number }[]
    ): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            // Validate division IDs exist
            const divisionIds = [...new Set(data.map((d) => d.division))]
            const validDivisions = await db
                .select({ id: divisions.id })
                .from(divisions)
                .where(inArray(divisions.id, divisionIds))

            const validIds = new Set(validDivisions.map((d) => d.id))
            for (const entry of data) {
                if (!validIds.has(entry.division)) {
                    return fail(`Invalid division ID: ${entry.division}`)
                }
            }

            const config = await getSeasonConfig()

            if (!config.seasonId) {
                return fail("No current season found.")
            }

            const session = await auth.api.getSession({
                headers: await headers()
            })
            if (!session) {
                return fail("Unauthorized - no session")
            }

            const currentUserId = session.user.id
            const playerIds = data.map((d) => d.playerId)

            // Delete existing evaluations by this user for these players this season
            if (playerIds.length > 0) {
                await db
                    .delete(evaluations)
                    .where(
                        and(
                            eq(evaluations.season, config.seasonId),
                            inArray(evaluations.player, playerIds),
                            eq(evaluations.evaluator, currentUserId)
                        )
                    )
            }

            // Insert new evaluations with evaluator
            if (data.length > 0) {
                await db.insert(evaluations).values(
                    data.map((entry) => ({
                        season: config.seasonId,
                        player: entry.playerId,
                        division: entry.division,
                        evaluator: currentUserId
                    }))
                )
            }

            await logAuditEntry({
                userId: currentUserId,
                action: "upsert",
                entityType: "evaluations",
                summary: `Saved ${data.length} player evaluations for current season`
            })

            revalidatePath("/dashboard/evaluate-players")
            return ok(undefined, "Evaluations saved successfully.")
        } catch (error) {
            logger.error("Error saving evaluations", undefined, error)
            return fail("Failed to save evaluations.")
        }
    }
)
