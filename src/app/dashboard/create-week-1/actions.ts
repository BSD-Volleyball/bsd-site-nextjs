"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    signups,
    drafts,
    commissioners,
    teams,
    seasons,
    divisions,
    week1Rosters,
    playerUnavailability
} from "@/database/schema"
import { and, desc, eq, inArray, lt, ne } from "drizzle-orm"
import { getSeasonConfig, getEventsByType } from "@/lib/site-config"
import { fetchPlayerScores } from "@/lib/player-score"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { logAuditEntry } from "@/lib/audit-log"
import {
    GROUP_COLORS,
    GROUP_LABELS,
    GROUP_ORDER,
    type Week1Candidate,
    type Week1GroupSummary,
    type Week1PriorityGroup,
    type Week1RosterAssignment
} from "./week1-types"

interface DraftSeasonRecord {
    seasonId: number
    seasonYear: number
    seasonName: string
    divisionLevel: number
    divisionName: string
    overall: number
}

function getDisplayName(candidate: Week1Candidate) {
    if (candidate.preferredName) {
        return `${candidate.preferredName} ${candidate.lastName}`
    }
    return `${candidate.firstName} ${candidate.lastName}`
}

function getGroupForUser({
    hasAnyDraft,
    playFirstWeek,
    missesTryout2Or3,
    mostRecentDraft,
    secondMostRecentDraft,
    currentSeasonId
}: {
    hasAnyDraft: boolean
    playFirstWeek: boolean
    missesTryout2Or3: boolean
    mostRecentDraft: DraftSeasonRecord | null
    secondMostRecentDraft: DraftSeasonRecord | null
    currentSeasonId: number
}): Week1PriorityGroup | null {
    if (!hasAnyDraft) {
        return "new_users"
    }

    if (!playFirstWeek) {
        return null
    }

    const seasonGap = mostRecentDraft
        ? currentSeasonId - mostRecentDraft.seasonId
        : null

    if (seasonGap !== null && seasonGap > 4) {
        return "week1_long_gap"
    }

    if (missesTryout2Or3) {
        return "week1_missing_tryout"
    }

    if (
        mostRecentDraft &&
        secondMostRecentDraft &&
        mostRecentDraft.divisionLevel > secondMostRecentDraft.divisionLevel
    ) {
        return "week1_dropped_division"
    }

    return "week1_other"
}

export async function getCreateWeek1Data(): Promise<{
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    candidates: Week1Candidate[]
    groups: Week1GroupSummary[]
}> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            seasonId: 0,
            seasonLabel: "",
            candidates: [],
            groups: []
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
                candidates: [],
                groups: []
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`
        const tryouts = getEventsByType(config, "tryout")
        const tryout1Event = tryouts[0] ?? null
        const tryout2Event = tryouts[1] ?? null
        const tryout3Event = tryouts[2] ?? null

        const [signupRowsRaw, commissionerRows, captainRows] =
            await Promise.all([
                db
                    .select({
                        signupId: signups.id,
                        userId: signups.player,
                        oldId: users.old_id,
                        firstName: users.first_name,
                        lastName: users.last_name,
                        preferredName: users.preferred_name,
                        male: users.male,
                        pairPickId: signups.pair_pick
                    })
                    .from(signups)
                    .innerJoin(users, eq(signups.player, users.id))
                    .where(eq(signups.season, config.seasonId))
                    .orderBy(users.last_name, users.first_name),
                db
                    .select({ userId: commissioners.commissioner })
                    .from(commissioners)
                    .where(eq(commissioners.season, config.seasonId)),
                db
                    .selectDistinct({ userId: teams.captain })
                    .from(teams)
                    .where(eq(teams.season, config.seasonId))
            ])

        const excludedUserIds = new Set<string>([
            ...commissionerRows.map((row) => row.userId),
            ...captainRows.map((row) => row.userId)
        ])

        const allSignupIds = signupRowsRaw.map((row) => row.signupId)
        const tryoutEventIds = [
            tryout1Event?.id,
            tryout2Event?.id,
            tryout3Event?.id
        ].filter((id): id is number => id != null)

        let unavailabilityRows: {
            signupId: number
            eventId: number
        }[] = []
        if (allSignupIds.length > 0 && tryoutEventIds.length > 0) {
            unavailabilityRows = await db
                .select({
                    signupId: playerUnavailability.signup_id,
                    eventId: playerUnavailability.event_id
                })
                .from(playerUnavailability)
                .where(
                    and(
                        inArray(playerUnavailability.signup_id, allSignupIds),
                        inArray(playerUnavailability.event_id, tryoutEventIds)
                    )
                )
        }

        const unavailBySignup = new Map<number, Set<number>>()
        for (const row of unavailabilityRows) {
            const set = unavailBySignup.get(row.signupId) ?? new Set<number>()
            set.add(row.eventId)
            unavailBySignup.set(row.signupId, set)
        }

        const signupRows = signupRowsRaw.filter((row) => {
            if (excludedUserIds.has(row.userId)) {
                return false
            }

            if (!tryout1Event) {
                return true
            }

            const unavailEvents = unavailBySignup.get(row.signupId) ?? new Set()
            return !unavailEvents.has(tryout1Event.id)
        })

        if (signupRows.length === 0) {
            return {
                status: true,
                seasonId: config.seasonId,
                seasonLabel,
                candidates: [],
                groups: GROUP_ORDER.map((key) => ({
                    key,
                    label: GROUP_LABELS[key],
                    colorClass: GROUP_COLORS[key],
                    count: 0
                }))
            }
        }

        const userIds = signupRows.map((row) => row.userId)

        const draftRows = await db
            .select({
                userId: drafts.user,
                seasonId: seasons.id,
                seasonYear: seasons.year,
                seasonName: seasons.season,
                divisionLevel: divisions.level,
                divisionName: divisions.name,
                overall: drafts.overall
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .innerJoin(seasons, eq(teams.season, seasons.id))
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(inArray(drafts.user, userIds))
            .orderBy(desc(seasons.id), drafts.overall)

        const draftsByUser = new Map<string, DraftSeasonRecord[]>()
        const draftEntryCountByUser = new Map<string, number>()

        for (const row of draftRows) {
            draftEntryCountByUser.set(
                row.userId,
                (draftEntryCountByUser.get(row.userId) || 0) + 1
            )

            const records = draftsByUser.get(row.userId) || []

            const hasSeasonAlready = records.some(
                (record) => record.seasonId === row.seasonId
            )

            if (!hasSeasonAlready) {
                records.push({
                    seasonId: row.seasonId,
                    seasonYear: row.seasonYear,
                    seasonName: row.seasonName,
                    divisionLevel: row.divisionLevel,
                    divisionName: row.divisionName,
                    overall: row.overall
                })
                draftsByUser.set(row.userId, records)
            }
        }

        const pairIds = signupRows
            .map((row) => row.pairPickId)
            .filter((pairId): pairId is string => !!pairId)
        const pairNameById = new Map<string, string>()
        if (pairIds.length > 0) {
            const pairRows = await db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name
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
        const scoreByUser = await fetchPlayerScores(userIds, config.seasonId)

        const candidates: Week1Candidate[] = []

        for (const row of signupRows) {
            const history = draftsByUser.get(row.userId) || []
            const mostRecentDraft = history[0] || null
            const secondMostRecentDraft = history[1] || null
            const hasAnyDraft = history.length > 0
            const unavailEvents = unavailBySignup.get(row.signupId) ?? new Set()
            const playFirstWeek =
                !tryout1Event || !unavailEvents.has(tryout1Event.id)
            const seasonsPlayedCount = history.length
            const placementScore = scoreByUser.get(row.userId) ?? 200

            const missesTryout2Or3 =
                (tryout2Event ? unavailEvents.has(tryout2Event.id) : false) ||
                (tryout3Event ? unavailEvents.has(tryout3Event.id) : false)

            const group = getGroupForUser({
                hasAnyDraft,
                playFirstWeek,
                missesTryout2Or3,
                mostRecentDraft,
                secondMostRecentDraft,
                currentSeasonId: config.seasonId
            })

            if (!group) {
                continue
            }

            const lastDraftSeasonLabel = mostRecentDraft
                ? `${mostRecentDraft.seasonName.charAt(0).toUpperCase() + mostRecentDraft.seasonName.slice(1)} ${mostRecentDraft.seasonYear}`
                : null
            const previousDraftSeasonLabel = secondMostRecentDraft
                ? `${secondMostRecentDraft.seasonName.charAt(0).toUpperCase() + secondMostRecentDraft.seasonName.slice(1)} ${secondMostRecentDraft.seasonYear}`
                : null

            candidates.push({
                userId: row.userId,
                oldId: row.oldId,
                firstName: row.firstName,
                lastName: row.lastName,
                preferredName: row.preferredName,
                male: row.male,
                playFirstWeek,
                pairUserId: row.pairPickId,
                group,
                groupLabel: GROUP_LABELS[group],
                overallMostRecent: mostRecentDraft?.overall ?? null,
                placementScore,
                seasonsPlayedCount,
                lastDraftSeasonId: mostRecentDraft?.seasonId ?? null,
                lastDraftSeasonLabel,
                lastDraftDivisionName: mostRecentDraft?.divisionName ?? null,
                previousDraftSeasonLabel,
                previousDraftDivisionName:
                    secondMostRecentDraft?.divisionName ?? null,
                pairWithName: row.pairPickId
                    ? (pairNameById.get(row.pairPickId) ?? null)
                    : null
            })
        }

        const pairMap = new Map<string, Set<string>>()
        for (const row of signupRows) {
            if (!row.pairPickId) {
                continue
            }

            const sourceSet = pairMap.get(row.userId) || new Set<string>()
            sourceSet.add(row.pairPickId)
            pairMap.set(row.userId, sourceSet)

            const targetSet = pairMap.get(row.pairPickId) || new Set<string>()
            targetSet.add(row.userId)
            pairMap.set(row.pairPickId, targetSet)
        }

        const [previousDraftSeason] = await db
            .select({
                seasonId: seasons.id
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .innerJoin(seasons, eq(teams.season, seasons.id))
            .where(lt(seasons.id, config.seasonId))
            .orderBy(desc(seasons.id))
            .limit(1)

        const bubblePlayerSet = new Set<string>()
        if (previousDraftSeason) {
            const bubbleRows = await db
                .select({
                    userId: drafts.user
                })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .where(
                    and(
                        eq(teams.season, previousDraftSeason.seasonId),
                        eq(drafts.round, 1),
                        inArray(drafts.user, userIds),
                        ne(divisions.name, "AA")
                    )
                )

            for (const row of bubbleRows) {
                bubblePlayerSet.add(row.userId)
            }
        }

        const groupRank = new Map(
            GROUP_ORDER.map((group, index) => [group, index])
        )
        const preliminaryGroupsByUser = new Map(
            candidates.map((candidate) => [candidate.userId, candidate.group])
        )

        for (const candidate of candidates) {
            if (candidate.group !== "week1_other") {
                continue
            }

            const candidateRank = groupRank.get(candidate.group) ?? 999
            const pairedUsers = [...(pairMap.get(candidate.userId) || [])]

            const hasPairInHigherGroup = pairedUsers.some((pairedUserId) => {
                const pairedGroup = preliminaryGroupsByUser.get(pairedUserId)
                if (!pairedGroup) {
                    return false
                }
                const pairedRank = groupRank.get(pairedGroup) ?? 999
                return pairedRank < candidateRank
            })

            if (hasPairInHigherGroup) {
                candidate.group = "week1_paired_with_higher"
                candidate.groupLabel = GROUP_LABELS.week1_paired_with_higher
                continue
            }

            if (bubblePlayerSet.has(candidate.userId)) {
                candidate.group = "week1_bubble_players"
                candidate.groupLabel = GROUP_LABELS.week1_bubble_players
            }
        }

        candidates.sort((a, b) => {
            const groupCmp =
                GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
            if (groupCmp !== 0) {
                return groupCmp
            }

            const aCount = draftEntryCountByUser.get(a.userId) || 0
            const bCount = draftEntryCountByUser.get(b.userId) || 0
            if (aCount !== bCount) {
                return aCount - bCount
            }

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

        const groups: Week1GroupSummary[] = GROUP_ORDER.map((key) => ({
            key,
            label: GROUP_LABELS[key],
            colorClass: GROUP_COLORS[key],
            count: candidates.filter((candidate) => candidate.group === key)
                .length
        }))

        return {
            status: true,
            seasonId: config.seasonId,
            seasonLabel,
            candidates,
            groups
        }
    } catch (error) {
        console.error("Error loading create week 1 data:", error)
        return {
            status: false,
            message: "Something went wrong while loading data.",
            seasonId: 0,
            seasonLabel: "",
            candidates: [],
            groups: []
        }
    }
}

export async function saveWeek1Rosters(
    assignments: Week1RosterAssignment[]
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to perform this action."
        }
    }

    if (assignments.length !== 104) {
        return {
            status: false,
            message:
                "Expected 104 assignments (96 primary + 8 alternates) before saving."
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

    const validAssignments = assignments.every((assignment) => {
        return (
            (assignment.sessionNumber === 1 ||
                assignment.sessionNumber === 2 ||
                assignment.sessionNumber === 3) &&
            assignment.courtNumber >= 1 &&
            assignment.courtNumber <= 4
        )
    })

    if (!validAssignments) {
        return {
            status: false,
            message: "Invalid session or court values in roster assignments."
        }
    }

    const primaryAssignments = assignments.filter(
        (assignment) =>
            assignment.sessionNumber === 1 || assignment.sessionNumber === 2
    )
    const alternateAssignments = assignments.filter(
        (assignment) => assignment.sessionNumber === 3
    )

    if (primaryAssignments.length !== 96) {
        return {
            status: false,
            message:
                "Expected exactly 96 primary assignments (sessions 1 and 2)."
        }
    }

    if (alternateAssignments.length !== 8) {
        return {
            status: false,
            message: "Expected exactly 8 alternates (session 3)."
        }
    }

    for (let court = 1; court <= 4; court++) {
        const courtAlternates = alternateAssignments.filter(
            (assignment) => assignment.courtNumber === court
        )
        if (courtAlternates.length !== 2) {
            return {
                status: false,
                message: `Expected 2 alternates for court ${court}.`
            }
        }
    }

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return {
            status: false,
            message: "No current season found."
        }
    }

    const signedUpRows = await db
        .select({ userId: signups.player })
        .from(signups)
        .where(
            and(
                eq(signups.season, config.seasonId),
                inArray(signups.player, [...uniqueUsers])
            )
        )

    if (signedUpRows.length !== assignments.length) {
        return {
            status: false,
            message:
                "All selected players must be signed up for the current season."
        }
    }

    try {
        await db.transaction(async (tx) => {
            await tx
                .delete(week1Rosters)
                .where(eq(week1Rosters.season, config.seasonId))

            await tx.insert(week1Rosters).values(
                assignments.map((assignment) => ({
                    season: config.seasonId,
                    user: assignment.userId,
                    session_number: assignment.sessionNumber,
                    court_number: assignment.courtNumber
                }))
            )
        })

        const session = await auth.api.getSession({ headers: await headers() })

        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "week1_rosters",
                summary: `Created week 1 rosters for season ${config.seasonId}`
            })
        }

        return {
            status: true,
            message: "Week 1 rosters saved successfully."
        }
    } catch (error) {
        console.error("Error saving week 1 rosters:", error)
        return {
            status: false,
            message: "Something went wrong while saving week 1 rosters."
        }
    }
}
