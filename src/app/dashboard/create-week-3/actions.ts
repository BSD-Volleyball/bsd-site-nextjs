"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    signups,
    drafts,
    teams,
    seasons,
    divisions,
    individual_divisions,
    movingDay,
    week2Rosters,
    week3Rosters
} from "@/database/schema"
import { and, desc, eq, inArray, lt } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { fetchPlayerScores, fetchRatingBasedScores } from "@/lib/player-score"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { logAuditEntry } from "@/lib/audit-log"
import type {
    Week3Candidate,
    Week3Division,
    Week3ExcludedPlayer,
    Week3SavedAssignment
} from "./week3-types"

interface DraftSeasonRecord {
    seasonId: number
    overall: number
}

function getDisplayName(candidate: Week3Candidate) {
    if (candidate.preferredName) {
        return `${candidate.preferredName} ${candidate.lastName}`
    }
    return `${candidate.firstName} ${candidate.lastName}`
}

export async function getCreateWeek3Data(): Promise<{
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    divisions: Week3Division[]
    candidates: Week3Candidate[]
    excludedPlayers: Week3ExcludedPlayer[]
}> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            seasonId: 0,
            seasonLabel: "",
            divisions: [],
            candidates: [],
            excludedPlayers: []
        }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                seasonId: 0,
                seasonLabel: "",
                divisions: [],
                candidates: [],
                excludedPlayers: []
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`
        const tryout3 = config.tryout3Date.trim().toLowerCase()

        const [
            activeDivisions,
            individualDivisionRows,
            signupRowsRaw,
            captainRows,
            week2Rows,
            forcedMoveRows,
            recommendationRows
        ] = await Promise.all([
            db
                .select({
                    id: divisions.id,
                    name: divisions.name,
                    level: divisions.level
                })
                .from(divisions)
                .where(eq(divisions.active, true))
                .orderBy(divisions.level),
            db
                .select({
                    divisionId: individual_divisions.division,
                    coaches: individual_divisions.coaches
                })
                .from(individual_divisions)
                .where(eq(individual_divisions.season, config.seasonId)),
            db
                .select({
                    userId: signups.player,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preffered_name,
                    male: users.male,
                    datesMissing: signups.dates_missing,
                    pairPickId: signups.pair_pick
                })
                .from(signups)
                .innerJoin(users, eq(signups.player, users.id))
                .where(eq(signups.season, config.seasonId))
                .orderBy(users.last_name, users.first_name),
            db
                .select({
                    userId: teams.captain,
                    captain2Id: teams.captain2,
                    divisionId: teams.division,
                    divisionName: divisions.name
                })
                .from(teams)
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .where(eq(teams.season, config.seasonId)),
            db
                .select({
                    userId: week2Rosters.user,
                    divisionId: week2Rosters.division
                })
                .from(week2Rosters)
                .where(eq(week2Rosters.season, config.seasonId)),
            db
                .select({
                    id: movingDay.id,
                    userId: movingDay.player,
                    direction: movingDay.direction
                })
                .from(movingDay)
                .where(
                    and(
                        eq(movingDay.season, config.seasonId),
                        eq(movingDay.is_forced, true)
                    )
                )
                .orderBy(desc(movingDay.id)),
            db
                .select({
                    userId: movingDay.player,
                    direction: movingDay.direction
                })
                .from(movingDay)
                .where(
                    and(
                        eq(movingDay.season, config.seasonId),
                        eq(movingDay.is_forced, false)
                    )
                )
        ])

        const coachesDivisionIds = new Set(
            individualDivisionRows
                .filter((r) => r.coaches)
                .map((r) => r.divisionId)
        )

        const divisionsWithMeta: Week3Division[] = activeDivisions.map(
            (division, index) => ({
                ...division,
                index,
                teamCount: index === activeDivisions.length - 1 ? 4 : 6,
                isLast: index === activeDivisions.length - 1,
                usesCoaches: coachesDivisionIds.has(division.id)
            })
        )

        const captainDivisionByUser = new Map<string, number>()
        const captainDivisionNameByUser = new Map<string, string>()
        for (const row of captainRows) {
            const existing = captainDivisionByUser.get(row.userId)
            // If we already have a non-coaches captain entry, keep it;
            // only overwrite if the stored entry is itself a coaches division
            if (existing && !coachesDivisionIds.has(existing)) {
                continue
            }
            captainDivisionByUser.set(row.userId, row.divisionId)
            captainDivisionNameByUser.set(row.userId, row.divisionName)
        }

        const week2DivisionByUser = new Map<string, number>()
        for (const row of week2Rows) {
            if (!week2DivisionByUser.has(row.userId)) {
                week2DivisionByUser.set(row.userId, row.divisionId)
            }
        }

        const forcedMoveByUser = new Map<string, "up" | "down">()
        for (const row of forcedMoveRows) {
            if (
                !forcedMoveByUser.has(row.userId) &&
                (row.direction === "up" || row.direction === "down")
            ) {
                forcedMoveByUser.set(row.userId, row.direction)
            }
        }

        const recommendationCountByUser = new Map<
            string,
            { up: number; down: number }
        >()
        for (const row of recommendationRows) {
            if (row.direction !== "up" && row.direction !== "down") {
                continue
            }

            const current = recommendationCountByUser.get(row.userId) || {
                up: 0,
                down: 0
            }
            if (row.direction === "up") {
                current.up += 1
            } else {
                current.down += 1
            }
            recommendationCountByUser.set(row.userId, current)
        }

        const excludedPlayers: Week3ExcludedPlayer[] = []

        const signupRows = signupRowsRaw.filter((row) => {
            if (!tryout3) {
                return true
            }

            const missingDates = (row.datesMissing || "")
                .split(",")
                .map((value) => value.trim().toLowerCase())
                .filter(Boolean)

            const isExcluded = missingDates.includes(tryout3)
            if (isExcluded) {
                excludedPlayers.push({
                    userId: row.userId,
                    firstName: row.firstName,
                    lastName: row.lastName,
                    preferredName: row.preferredName
                })
            }

            return !isExcluded
        })

        if (signupRows.length === 0) {
            return {
                status: true,
                seasonId: config.seasonId,
                seasonLabel,
                divisions: divisionsWithMeta,
                candidates: [],
                excludedPlayers
            }
        }

        const userIds = signupRows.map((row) => row.userId)

        const draftRows = await db
            .select({
                userId: drafts.user,
                seasonId: seasons.id,
                overall: drafts.overall
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .innerJoin(seasons, eq(teams.season, seasons.id))
            .where(inArray(drafts.user, userIds))
            .orderBy(desc(seasons.id), drafts.overall)

        const draftsByUser = new Map<string, DraftSeasonRecord[]>()

        for (const row of draftRows) {
            const records = draftsByUser.get(row.userId) || []
            const hasSeasonAlready = records.some(
                (record) => record.seasonId === row.seasonId
            )

            if (!hasSeasonAlready) {
                records.push({
                    seasonId: row.seasonId,
                    overall: row.overall
                })
                draftsByUser.set(row.userId, records)
            }
        }

        const scoreByUser = await fetchPlayerScores(userIds, config.seasonId)

        const existingPlayerIds = userIds.filter((id) => draftsByUser.has(id))
        const ratingScoreByUser =
            existingPlayerIds.length > 0
                ? await fetchRatingBasedScores(
                      existingPlayerIds,
                      config.seasonId
                  )
                : new Map<string, number>()

        // Compute consecutive seasons in top division for each candidate
        const topDivisionId = activeDivisions[0]?.id ?? null

        const [pastSeasonRows, topDivHistoryRows] = await Promise.all([
            db
                .select({ id: seasons.id })
                .from(seasons)
                .where(lt(seasons.id, config.seasonId))
                .orderBy(desc(seasons.id)),
            topDivisionId && userIds.length > 0
                ? db
                      .select({
                          userId: week3Rosters.user,
                          seasonId: week3Rosters.season
                      })
                      .from(week3Rosters)
                      .where(
                          and(
                              inArray(week3Rosters.user, userIds),
                              eq(week3Rosters.division, topDivisionId)
                          )
                      )
                : Promise.resolve([])
        ])

        const topDivSeasonsByUser = new Map<string, Set<number>>()
        for (const row of topDivHistoryRows) {
            const set = topDivSeasonsByUser.get(row.userId) ?? new Set<number>()
            set.add(row.seasonId)
            topDivSeasonsByUser.set(row.userId, set)
        }

        const pastSeasonIds = pastSeasonRows.map((s) => s.id)
        const consecutiveSeasonsInTopDivByUser = new Map<string, number>()
        for (const userId of userIds) {
            const userSeasons =
                topDivSeasonsByUser.get(userId) ?? new Set<number>()
            let count = 0
            for (const seasonId of pastSeasonIds) {
                if (userSeasons.has(seasonId)) {
                    count++
                } else {
                    break
                }
            }
            consecutiveSeasonsInTopDivByUser.set(userId, count)
        }

        const mutualPairMap = new Map<string, string>()
        const pairPickMap = new Map(
            signupRows
                .filter((row) => !!row.pairPickId)
                .map((row) => [row.userId, row.pairPickId as string])
        )

        for (const row of signupRows) {
            if (!row.pairPickId) {
                continue
            }

            const reciprocal = pairPickMap.get(row.pairPickId)
            if (reciprocal === row.userId) {
                mutualPairMap.set(row.userId, row.pairPickId)
            }
        }

        const pairIds = [
            ...new Set(signupRows.map((row) => row.pairPickId).filter(Boolean))
        ] as string[]
        const pairNameById = new Map<string, string>()

        if (pairIds.length > 0) {
            const pairRows = await db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preffered_name
                })
                .from(users)
                .where(inArray(users.id, pairIds))

            for (const row of pairRows) {
                pairNameById.set(
                    row.id,
                    row.preferredName
                        ? `${row.preferredName} ${row.lastName}`
                        : `${row.firstName} ${row.lastName}`
                )
            }
        }

        const candidates: Week3Candidate[] = signupRows.map((row) => {
            const history = draftsByUser.get(row.userId) || []
            const mostRecent = history[0] || null
            const placementScore = scoreByUser.get(row.userId) ?? 200
            const recommendations = recommendationCountByUser.get(
                row.userId
            ) || {
                up: 0,
                down: 0
            }

            return {
                userId: row.userId,
                firstName: row.firstName,
                lastName: row.lastName,
                preferredName: row.preferredName,
                male: row.male,
                pairUserId: mutualPairMap.get(row.userId) || null,
                pairWithName: row.pairPickId
                    ? (pairNameById.get(row.pairPickId) ?? null)
                    : null,
                overallMostRecent: mostRecent?.overall ?? null,
                placementScore,
                ratingScore: ratingScoreByUser.get(row.userId) ?? null,
                consecutiveSeasonsInTopDiv:
                    consecutiveSeasonsInTopDivByUser.get(row.userId) ?? 0,
                seasonsPlayedCount: history.length,
                captainDivisionId:
                    captainDivisionByUser.get(row.userId) || null,
                captainDivisionName:
                    captainDivisionNameByUser.get(row.userId) || null,
                isCaptain: captainDivisionByUser.has(row.userId),
                week2DivisionId: week2DivisionByUser.get(row.userId) || null,
                forcedMoveDirection: forcedMoveByUser.get(row.userId) || null,
                recommendationUpCount: recommendations.up,
                recommendationDownCount: recommendations.down
            }
        })

        candidates.sort((a, b) => {
            if (a.placementScore !== b.placementScore) {
                return a.placementScore - b.placementScore
            }

            const aLast = a.lastName.toLowerCase()
            const bLast = b.lastName.toLowerCase()
            const lastCmp = aLast.localeCompare(bLast)
            if (lastCmp !== 0) {
                return lastCmp
            }

            return getDisplayName(a)
                .toLowerCase()
                .localeCompare(getDisplayName(b).toLowerCase())
        })

        return {
            status: true,
            seasonId: config.seasonId,
            seasonLabel,
            divisions: divisionsWithMeta,
            candidates,
            excludedPlayers
        }
    } catch (error) {
        console.error("Error loading create week 3 data:", error)
        return {
            status: false,
            message: "Something went wrong while loading data.",
            seasonId: 0,
            seasonLabel: "",
            divisions: [],
            candidates: [],
            excludedPlayers: []
        }
    }
}

export async function saveWeek3Rosters(
    assignments: Week3SavedAssignment[]
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to perform this action."
        }
    }

    if (assignments.length === 0) {
        return {
            status: false,
            message: "No roster assignments provided."
        }
    }

    const uniqueUsers = new Set(
        assignments.map((assignment) => assignment.userId)
    )

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return {
            status: false,
            message: "No current season found."
        }
    }

    const [validSignups, activeDivisions, captainRows, individualDivRows] =
        await Promise.all([
            db
                .select({ userId: signups.player })
                .from(signups)
                .where(
                    and(
                        eq(signups.season, config.seasonId),
                        inArray(signups.player, [...uniqueUsers])
                    )
                ),
            db
                .select({ id: divisions.id })
                .from(divisions)
                .where(eq(divisions.active, true)),
            db
                .select({
                    userId: teams.captain,
                    captain2Id: teams.captain2,
                    divisionId: teams.division
                })
                .from(teams)
                .where(eq(teams.season, config.seasonId)),
            db
                .select({
                    divisionId: individual_divisions.division,
                    coaches: individual_divisions.coaches
                })
                .from(individual_divisions)
                .where(eq(individual_divisions.season, config.seasonId))
        ])

    if (validSignups.length !== uniqueUsers.size) {
        return {
            status: false,
            message:
                "All selected players must be signed up for the current season."
        }
    }

    const activeDivisionIds = new Set(
        activeDivisions.map((division) => division.id)
    )

    const hasInvalidDivision = assignments.some(
        (assignment) => !activeDivisionIds.has(assignment.divisionId)
    )

    if (hasInvalidDivision) {
        return {
            status: false,
            message: "One or more assignments are using an invalid division."
        }
    }

    const saveCoachesDivisionIds = new Set(
        individualDivRows.filter((r) => r.coaches).map((r) => r.divisionId)
    )

    const captainDivisionByUser = new Map<string, number>()
    for (const row of captainRows) {
        const existing = captainDivisionByUser.get(row.userId)
        if (existing && !saveCoachesDivisionIds.has(existing)) {
            continue
        }
        captainDivisionByUser.set(row.userId, row.divisionId)
    }

    for (const assignment of assignments) {
        const captainDivisionId = captainDivisionByUser.get(assignment.userId)
        if (!captainDivisionId) {
            continue
        }
        // Coaches are treated as regular players — no division or flag constraint
        if (saveCoachesDivisionIds.has(captainDivisionId)) {
            continue
        }
        if (
            assignment.divisionId !== captainDivisionId ||
            !assignment.isCaptain
        ) {
            return {
                status: false,
                message:
                    "Captains must remain in their captained division and be flagged as captains."
            }
        }
    }

    try {
        await db.transaction(async (tx) => {
            await tx
                .delete(week3Rosters)
                .where(eq(week3Rosters.season, config.seasonId))

            await tx.insert(week3Rosters).values(
                assignments.map((assignment) => ({
                    season: config.seasonId,
                    user: assignment.userId,
                    division: assignment.divisionId,
                    team_number: assignment.teamNumber,
                    is_captain: assignment.isCaptain
                }))
            )
        })

        const session = await auth.api.getSession({ headers: await headers() })

        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "week3_rosters",
                summary: `Created week 3 rosters for season ${config.seasonId}`
            })
        }

        return {
            status: true,
            message: "Week 3 rosters saved successfully."
        }
    } catch (error) {
        console.error("Error saving week 3 rosters:", error)
        return {
            status: false,
            message: "Something went wrong while saving week 3 rosters."
        }
    }
}
