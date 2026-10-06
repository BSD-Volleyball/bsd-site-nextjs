import "server-only"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    signups,
    drafts,
    evaluations,
    divisions
} from "@/database/schema"
import { eq, and, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { isAdminOrDirectorBySession } from "@/next/session"

export interface DivisionOption {
    id: number
    name: string
    level: number
}

export interface EvaluatorDetail {
    evaluatorName: string
    divisionId: number
    divisionName: string
}

export interface NewPlayerEntry {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    height: number | null
    experience: string | null
    assessment: string | null
    currentUserEvaluation: number | null
    averageEvaluation: number | null
    evaluationCount: number
    evaluatorDetails: EvaluatorDetail[]
}

export const getNewPlayers = withAction(
    async (): Promise<
        ActionResult<{
            players: NewPlayerEntry[]
            divisions: DivisionOption[]
            seasonLabel: string
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

            const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

            const allDivisions = await db
                .select({
                    id: divisions.id,
                    name: divisions.name,
                    level: divisions.level
                })
                .from(divisions)
                .where(eq(divisions.active, true))
                .orderBy(divisions.level)

            // Get all signed up players for this season
            const signupRows = await db
                .select({
                    userId: signups.player,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name,
                    male: users.male,
                    height: users.height,
                    experience: users.experience,
                    assessment: users.assessment
                })
                .from(signups)
                .innerJoin(users, eq(signups.player, users.id))
                .where(eq(signups.season, config.seasonId))
                .orderBy(users.last_name, users.first_name)

            // Find which players have been drafted (not new)
            const userIds = signupRows.map((r) => r.userId)
            let draftedUserIds = new Set<string>()

            if (userIds.length > 0) {
                const draftedUsers = await db
                    .select({ user: drafts.user })
                    .from(drafts)
                    .where(inArray(drafts.user, userIds))

                draftedUserIds = new Set(draftedUsers.map((d) => d.user))
            }

            // Filter to only new players
            const newPlayers = signupRows.filter(
                (r) => !draftedUserIds.has(r.userId)
            )

            // Get current user session
            const session = await auth.api.getSession({
                headers: await headers()
            })
            const currentUserId = session?.user.id

            // Get existing evaluations for this season
            const newPlayerIds = newPlayers.map((p) => p.userId)
            const playerEvaluationsMap = new Map<
                string,
                {
                    currentUserEval: number | null
                    allEvals: Array<{
                        divisionId: number
                        divisionLevel: number
                        divisionName: string
                        evaluatorName: string
                    }>
                }
            >()

            if (newPlayerIds.length > 0 && currentUserId) {
                const existingEvals = await db
                    .select({
                        player: evaluations.player,
                        division: evaluations.division,
                        evaluator: evaluations.evaluator,
                        divisionName: divisions.name,
                        divisionLevel: divisions.level,
                        evaluatorFirstName: users.first_name,
                        evaluatorPreferredName: users.preferred_name
                    })
                    .from(evaluations)
                    .innerJoin(
                        divisions,
                        eq(evaluations.division, divisions.id)
                    )
                    .innerJoin(users, eq(evaluations.evaluator, users.id))
                    .where(
                        and(
                            eq(evaluations.season, config.seasonId),
                            inArray(evaluations.player, newPlayerIds)
                        )
                    )

                // Group evaluations by player
                for (const evalRow of existingEvals) {
                    if (!playerEvaluationsMap.has(evalRow.player)) {
                        playerEvaluationsMap.set(evalRow.player, {
                            currentUserEval: null,
                            allEvals: []
                        })
                    }

                    const playerData = playerEvaluationsMap.get(evalRow.player)!

                    if (evalRow.evaluator === currentUserId) {
                        playerData.currentUserEval = evalRow.division
                    }

                    playerData.allEvals.push({
                        divisionId: evalRow.division,
                        divisionLevel: evalRow.divisionLevel,
                        divisionName: evalRow.divisionName,
                        evaluatorName:
                            evalRow.evaluatorPreferredName ||
                            evalRow.evaluatorFirstName
                    })
                }
            }

            const entries: NewPlayerEntry[] = newPlayers.map((row) => {
                const evalData = playerEvaluationsMap.get(row.userId) || {
                    currentUserEval: null,
                    allEvals: []
                }

                const averageEvaluation =
                    evalData.allEvals.length > 0
                        ? evalData.allEvals.reduce(
                              (sum, e) => sum + e.divisionLevel,
                              0
                          ) / evalData.allEvals.length
                        : null

                return {
                    ...row,
                    currentUserEvaluation: evalData.currentUserEval,
                    averageEvaluation,
                    evaluationCount: evalData.allEvals.length,
                    evaluatorDetails: evalData.allEvals
                }
            })

            return ok({
                players: entries,
                divisions: allDivisions,
                seasonLabel
            })
        } catch (error) {
            logger.error("Error fetching new players", undefined, error)
            return fail("Something went wrong.")
        }
    }
)
