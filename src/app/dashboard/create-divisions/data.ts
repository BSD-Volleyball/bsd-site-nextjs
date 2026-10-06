import "server-only"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { db } from "@/database/db"
import {
    divisions,
    drafts,
    evaluations,
    individual_divisions,
    signups,
    teams,
    users
} from "@/database/schema"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { isAdminOrDirectorBySession } from "@/next/session"

export interface ActiveDivision {
    id: number
    name: string
    level: number
}

export interface ExistingDivisionConfig {
    divisionId: number
    teams: number
    genderSplit: string
    coaches: boolean
}

export interface DivisionPlayerCounts {
    divisionId: number
    males: number
    nonMales: number
}

export interface DivisionsPageData {
    seasonId: number
    activeDivisions: ActiveDivision[]
    totalMales: number
    totalNonMales: number
    existingConfig: ExistingDivisionConfig[]
    returningByDivision: DivisionPlayerCounts[]
    evaluatedByDivision: DivisionPlayerCounts[]
}

export const getDivisionsPageData = withAction(
    async (): Promise<ActionResult<DivisionsPageData>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const config = await getSeasonConfig()
            if (!config.seasonId) {
                return fail("No active season found.")
            }

            const [activeDivisionRows, signupRows, existingConfigRows] =
                await Promise.all([
                    db
                        .select({
                            id: divisions.id,
                            name: divisions.name,
                            level: divisions.level
                        })
                        .from(divisions)
                        .where(eq(divisions.active, true))
                        .orderBy(asc(divisions.level)),

                    db
                        .select({ userId: signups.player, male: users.male })
                        .from(signups)
                        .innerJoin(users, eq(signups.player, users.id))
                        .where(eq(signups.season, config.seasonId)),

                    db
                        .select({
                            divisionId: individual_divisions.division,
                            teams: individual_divisions.teams,
                            genderSplit: individual_divisions.gender_split,
                            coaches: individual_divisions.coaches
                        })
                        .from(individual_divisions)
                        .where(eq(individual_divisions.season, config.seasonId))
                ])

            // Total gender counts
            let totalMales = 0
            let totalNonMales = 0
            for (const row of signupRows) {
                if (row.male === true) totalMales++
                else totalNonMales++
            }

            const signedUpUserIds = signupRows.map((r) => r.userId)

            // --- Returning players: find each signed-up player's most recent draft division ---
            const draftHistoryRows =
                signedUpUserIds.length > 0
                    ? await db
                          .select({
                              userId: drafts.user,
                              divisionId: divisions.id,
                              seasonId: teams.season
                          })
                          .from(drafts)
                          .innerJoin(teams, eq(drafts.team, teams.id))
                          .innerJoin(
                              divisions,
                              eq(teams.division, divisions.id)
                          )
                          .where(inArray(drafts.user, signedUpUserIds))
                          .orderBy(desc(teams.season))
                    : []

            // Keep only the most recent draft division per player
            const lastDraftDivision = new Map<string, number>() // userId → divisionId
            for (const row of draftHistoryRows) {
                if (!lastDraftDivision.has(row.userId)) {
                    lastDraftDivision.set(row.userId, row.divisionId)
                }
            }

            // New players = signed up for current season but have no prior draft history
            const newPlayerIds = signedUpUserIds.filter(
                (id) => !lastDraftDivision.has(id)
            )

            // --- Evaluated new players: avg division.level from evaluations this season ---
            const evalRows =
                newPlayerIds.length > 0
                    ? await db
                          .select({
                              playerId: evaluations.player,
                              divisionLevel: divisions.level
                          })
                          .from(evaluations)
                          .innerJoin(
                              divisions,
                              eq(evaluations.division, divisions.id)
                          )
                          .where(
                              and(
                                  eq(evaluations.season, config.seasonId),
                                  inArray(evaluations.player, newPlayerIds)
                              )
                          )
                    : []

            // Collect all evaluation levels per new player
            const playerEvalLevels = new Map<string, number[]>()
            for (const row of evalRows) {
                const arr = playerEvalLevels.get(row.playerId) ?? []
                arr.push(row.divisionLevel)
                playerEvalLevels.set(row.playerId, arr)
            }

            // Map an average level to the nearest active division id
            const findNearestDivisionId = (avgLevel: number): number => {
                let nearestId = activeDivisionRows[0].id
                let minDiff = Math.abs(avgLevel - activeDivisionRows[0].level)
                for (const div of activeDivisionRows) {
                    const diff = Math.abs(avgLevel - div.level)
                    if (diff < minDiff) {
                        minDiff = diff
                        nearestId = div.id
                    }
                }
                return nearestId
            }

            // Build per-division counts
            const returningCounts = new Map<
                number,
                { males: number; nonMales: number }
            >()
            const evaluatedCounts = new Map<
                number,
                { males: number; nonMales: number }
            >()

            for (const row of signupRows) {
                const isMale = row.male === true
                const lastDiv = lastDraftDivision.get(row.userId)

                if (lastDiv !== undefined) {
                    // Returning player — bucket by last drafted division
                    const c = returningCounts.get(lastDiv) ?? {
                        males: 0,
                        nonMales: 0
                    }
                    if (isMale) c.males++
                    else c.nonMales++
                    returningCounts.set(lastDiv, c)
                } else {
                    // New player — bucket by evaluated division (if evaluated)
                    const levels = playerEvalLevels.get(row.userId)
                    if (
                        levels &&
                        levels.length > 0 &&
                        activeDivisionRows.length > 0
                    ) {
                        const avgLevel =
                            levels.reduce((s, l) => s + l, 0) / levels.length
                        const divId = findNearestDivisionId(avgLevel)
                        const c = evaluatedCounts.get(divId) ?? {
                            males: 0,
                            nonMales: 0
                        }
                        if (isMale) c.males++
                        else c.nonMales++
                        evaluatedCounts.set(divId, c)
                    }
                }
            }

            const returningByDivision: DivisionPlayerCounts[] = [
                ...returningCounts.entries()
            ].map(([divisionId, counts]) => ({ divisionId, ...counts }))

            const evaluatedByDivision: DivisionPlayerCounts[] = [
                ...evaluatedCounts.entries()
            ].map(([divisionId, counts]) => ({ divisionId, ...counts }))

            return ok({
                seasonId: config.seasonId,
                activeDivisions: activeDivisionRows,
                totalMales,
                totalNonMales,
                existingConfig: existingConfigRows,
                returningByDivision,
                evaluatedByDivision
            })
        } catch (error) {
            logger.error("Error loading divisions page data", undefined, error)
            return fail("Something went wrong loading division data.")
        }
    }
)
