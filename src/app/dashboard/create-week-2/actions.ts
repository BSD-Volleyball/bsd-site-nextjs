"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    signups,
    drafts,
    evaluations,
    teams,
    seasons,
    divisions,
    week2Rosters
} from "@/database/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { logAuditEntry } from "@/lib/audit-log"
import type {
    Week2Candidate,
    Week2Division,
    Week2ExcludedPlayer,
    Week2SavedAssignment
} from "./week2-types"

interface DraftSeasonRecord {
    seasonId: number
    overall: number
}

function getDisplayName(candidate: Week2Candidate) {
    if (candidate.preferredName) {
        return `${candidate.preferredName} ${candidate.lastName}`
    }
    return `${candidate.firstName} ${candidate.lastName}`
}

export async function getCreateWeek2Data(): Promise<{
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    divisions: Week2Division[]
    candidates: Week2Candidate[]
    excludedPlayers: Week2ExcludedPlayer[]
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
        const tryout2 = config.tryout2Date.trim().toLowerCase()

        const [activeDivisions, signupRowsRaw, captainRows] = await Promise.all(
            [
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
                        userId: signups.player,
                        oldId: users.old_id,
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
                        divisionId: teams.division,
                        divisionName: divisions.name
                    })
                    .from(teams)
                    .innerJoin(divisions, eq(teams.division, divisions.id))
                    .where(eq(teams.season, config.seasonId))
            ]
        )

        const divisionsWithMeta: Week2Division[] = activeDivisions.map(
            (division, index) => ({
                ...division,
                index,
                teamCount: index === activeDivisions.length - 1 ? 4 : 6,
                isLast: index === activeDivisions.length - 1
            })
        )

        const captainDivisionByUser = new Map<string, number>()
        const captainDivisionNameByUser = new Map<string, string>()
        for (const row of captainRows) {
            captainDivisionByUser.set(row.userId, row.divisionId)
            captainDivisionNameByUser.set(row.userId, row.divisionName)
        }

        const excludedPlayers: Week2ExcludedPlayer[] = []

        const signupRows = signupRowsRaw.filter((row) => {
            if (!tryout2) {
                return true
            }

            const missingDates = (row.datesMissing || "")
                .split(",")
                .map((value) => value.trim().toLowerCase())
                .filter(Boolean)

            const isExcluded = missingDates.includes(tryout2)
            if (isExcluded) {
                excludedPlayers.push({
                    userId: row.userId,
                    oldId: row.oldId,
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

        const usersWithoutDraft = userIds.filter(
            (userId) => !draftsByUser.has(userId)
        )

        const evaluationScoreByUser = new Map<string, number>()
        if (usersWithoutDraft.length > 0) {
            const evaluationRows = await db
                .select({
                    playerId: evaluations.player,
                    divisionLevel: divisions.level
                })
                .from(evaluations)
                .innerJoin(divisions, eq(evaluations.division, divisions.id))
                .where(
                    and(
                        eq(evaluations.season, config.seasonId),
                        inArray(evaluations.player, usersWithoutDraft)
                    )
                )

            const aggregates = new Map<string, { sum: number; count: number }>()
            for (const row of evaluationRows) {
                const current = aggregates.get(row.playerId) || {
                    sum: 0,
                    count: 0
                }
                current.sum += row.divisionLevel
                current.count += 1
                aggregates.set(row.playerId, current)
            }

            for (const [playerId, aggregate] of aggregates.entries()) {
                const averageDivisionLevel = aggregate.sum / aggregate.count
                evaluationScoreByUser.set(
                    playerId,
                    (averageDivisionLevel - 1) * 50
                )
            }
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

        const candidates: Week2Candidate[] = signupRows.map((row) => {
            const history = draftsByUser.get(row.userId) || []
            const mostRecent = history[0] || null
            const placementScore = mostRecent
                ? mostRecent.overall
                : (evaluationScoreByUser.get(row.userId) ?? 200)

            return {
                userId: row.userId,
                oldId: row.oldId,
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
                seasonsPlayedCount: history.length,
                captainDivisionId:
                    captainDivisionByUser.get(row.userId) || null,
                captainDivisionName:
                    captainDivisionNameByUser.get(row.userId) || null,
                isCaptain: captainDivisionByUser.has(row.userId)
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
        console.error("Error loading create week 2 data:", error)
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

export async function saveWeek2Rosters(
    assignments: Week2SavedAssignment[]
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

    if (uniqueUsers.size !== assignments.length) {
        return {
            status: false,
            message: "Duplicate players found in roster assignments."
        }
    }

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return {
            status: false,
            message: "No current season found."
        }
    }

    const [validSignups, activeDivisions, captainRows] = await Promise.all([
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
                divisionId: teams.division
            })
            .from(teams)
            .where(eq(teams.season, config.seasonId))
    ])

    if (validSignups.length !== assignments.length) {
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

    const captainDivisionByUser = new Map<string, number>()
    for (const row of captainRows) {
        captainDivisionByUser.set(row.userId, row.divisionId)
    }

    for (const assignment of assignments) {
        const captainDivisionId = captainDivisionByUser.get(assignment.userId)
        if (
            captainDivisionId &&
            (assignment.divisionId !== captainDivisionId ||
                !assignment.isCaptain)
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
                .delete(week2Rosters)
                .where(eq(week2Rosters.season, config.seasonId))

            await tx.insert(week2Rosters).values(
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
                entityType: "week2_rosters",
                summary: `Created week 2 rosters for season ${config.seasonId}`
            })
        }

        return {
            status: true,
            message: "Week 2 rosters saved successfully."
        }
    } catch (error) {
        console.error("Error saving week 2 rosters:", error)
        return {
            status: false,
            message: "Something went wrong while saving week 2 rosters."
        }
    }
}
