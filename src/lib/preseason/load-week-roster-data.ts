// Shared data loading for the week-2/3 roster builders. Callers (the route
// actions) are responsible for authorization; these helpers only assemble
// data. Server-only: never import from client components.

import "server-only"

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
import { getSeasonConfig, getEventsByType } from "@/lib/site-config"
import { fetchPlayerScores } from "@/lib/player-score"
import {
    getUnavailableSignupIdsForEvent,
    fetchRatingScoresForReturningPlayers
} from "@/lib/week-rosters"
import { formatDisplayName, parseGenderSplit } from "@/lib/utils"
import {
    LAST_DIVISION_TEAM_COUNT,
    STANDARD_DIVISION_TEAM_COUNT
} from "./config"
import type {
    ExcludedPlayer,
    PreseasonCandidate,
    PreseasonDivision
} from "./types"

export interface DraftSeasonRecord {
    seasonId: number
    overall: number
    divisionName: string
}

export interface PreseasonBaseCandidate extends PreseasonCandidate {
    oldId: number | null
}

export interface PreseasonBaseData {
    seasonId: number
    seasonLabel: string
    divisions: PreseasonDivision[]
    candidates: PreseasonBaseCandidate[]
    excludedPlayers: ExcludedPlayer[]
    draftsByUser: Map<string, DraftSeasonRecord[]>
    userIds: string[]
}

export type PreseasonLoadResult =
    | { ok: true; data: PreseasonBaseData }
    | { ok: false; message: string }

export interface LoadPreseasonBaseDataOptions {
    /** Index into the season's tryout events (week 2 → 1, week 3 → 2). */
    tryoutEventIndex: number
    /**
     * How captains of coaches divisions are treated:
     * - "exclude" (week 2): they are not captains at all — dropped from the
     *   captain maps so they place as regular players.
     * - "preferRegular" (week 3): kept, but a user captaining both a coaches
     *   and a regular division resolves to the regular one; the placement
     *   engine neutralizes coaches-division captains itself.
     */
    coachCaptainHandling: "exclude" | "preferRegular"
}

function compareBaseCandidates(
    a: PreseasonBaseCandidate,
    b: PreseasonBaseCandidate
) {
    if (a.placementScore !== b.placementScore) {
        return a.placementScore - b.placementScore
    }

    const lastCmp = a.lastName
        .toLowerCase()
        .localeCompare(b.lastName.toLowerCase())
    if (lastCmp !== 0) {
        return lastCmp
    }

    const aName = formatDisplayName(a.firstName, a.lastName, a.preferredName)
    const bName = formatDisplayName(b.firstName, b.lastName, b.preferredName)
    return aName.toLowerCase().localeCompare(bName.toLowerCase())
}

export async function loadPreseasonBaseData(
    options: LoadPreseasonBaseDataOptions
): Promise<PreseasonLoadResult> {
    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return { ok: false, message: "No current season found." }
    }

    const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`
    const tryouts = getEventsByType(config, "tryout")
    const tryoutEvent = tryouts[options.tryoutEventIndex] ?? null

    const [activeDivisions, indivDivRows, signupRowsRaw, captainRows] =
        await Promise.all([
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
                    coaches: individual_divisions.coaches,
                    genderSplit: individual_divisions.gender_split,
                    teams: individual_divisions.teams
                })
                .from(individual_divisions)
                .where(eq(individual_divisions.season, config.seasonId)),
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
                .select({
                    userId: teams.captain,
                    divisionId: teams.division,
                    divisionName: divisions.name
                })
                .from(teams)
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .where(eq(teams.season, config.seasonId))
        ])

    const coachesDivisionIds = new Set(
        indivDivRows.filter((row) => row.coaches).map((row) => row.divisionId)
    )
    const genderSplitByDivision = new Map(
        indivDivRows.map((row) => [row.divisionId, row.genderSplit])
    )
    const teamCountByDivision = new Map(
        indivDivRows.map((row) => [row.divisionId, row.teams])
    )

    // `individual_divisions` holds exactly the divisions enabled for this
    // season (saving division selections deletes the season's rows and
    // reinserts only the enabled ones), so it — not the league-wide `active`
    // flag — is what the preseason weeks must mirror. Before divisions have
    // been configured for the season there are no rows at all; fall back to
    // the active list so the roster builders still open.
    const configuredDivisions = activeDivisions.filter((division) =>
        teamCountByDivision.has(division.id)
    )
    const seasonDivisions =
        configuredDivisions.length > 0 ? configuredDivisions : activeDivisions

    const divisionsWithMeta: PreseasonDivision[] = seasonDivisions.map(
        (division, index) => {
            const isLast = index === seasonDivisions.length - 1
            return {
                ...division,
                index,
                teamCount:
                    teamCountByDivision.get(division.id) ??
                    (isLast
                        ? LAST_DIVISION_TEAM_COUNT
                        : STANDARD_DIVISION_TEAM_COUNT),
                isLast,
                usesCoaches: coachesDivisionIds.has(division.id),
                ...parseGenderSplit(genderSplitByDivision.get(division.id))
            }
        }
    )

    const captainDivisionByUser = new Map<string, number>()
    const captainDivisionNameByUser = new Map<string, string>()
    for (const row of captainRows) {
        if (options.coachCaptainHandling === "exclude") {
            if (!coachesDivisionIds.has(row.divisionId)) {
                captainDivisionByUser.set(row.userId, row.divisionId)
                captainDivisionNameByUser.set(row.userId, row.divisionName)
            }
            continue
        }

        // "preferRegular": if we already have a non-coaches captain entry,
        // keep it; only overwrite if the stored entry is a coaches division
        const existing = captainDivisionByUser.get(row.userId)
        if (existing && !coachesDivisionIds.has(existing)) {
            continue
        }
        captainDivisionByUser.set(row.userId, row.divisionId)
        captainDivisionNameByUser.set(row.userId, row.divisionName)
    }

    const excludedPlayers: ExcludedPlayer[] = []

    const unavailableSignupIds = tryoutEvent
        ? await getUnavailableSignupIdsForEvent(
              tryoutEvent.id,
              signupRowsRaw.map((row) => row.signupId)
          )
        : new Set<number>()

    const signupRows = signupRowsRaw.filter((row) => {
        if (!tryoutEvent) {
            return true
        }

        const isExcluded = unavailableSignupIds.has(row.signupId)
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
            ok: true,
            data: {
                seasonId: config.seasonId,
                seasonLabel,
                divisions: divisionsWithMeta,
                candidates: [],
                excludedPlayers,
                draftsByUser: new Map(),
                userIds: []
            }
        }
    }

    const userIds = signupRows.map((row) => row.userId)

    const draftRows = await db
        .select({
            userId: drafts.user,
            seasonId: seasons.id,
            overall: drafts.overall,
            divisionName: divisions.name
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .innerJoin(divisions, eq(teams.division, divisions.id))
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
                overall: row.overall,
                divisionName: row.divisionName
            })
            draftsByUser.set(row.userId, records)
        }
    }

    const scoreByUser = await fetchPlayerScores(userIds, config.seasonId)

    const ratingScoreByUser = await fetchRatingScoresForReturningPlayers(
        userIds,
        (id) => draftsByUser.has(id),
        config.seasonId
    )

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
                preferredName: users.preferred_name
            })
            .from(users)
            .where(inArray(users.id, pairIds))

        for (const row of pairRows) {
            pairNameById.set(
                row.id,
                formatDisplayName(
                    row.firstName,
                    row.lastName,
                    row.preferredName
                )
            )
        }
    }

    const candidates: PreseasonBaseCandidate[] = signupRows.map((row) => {
        const history = draftsByUser.get(row.userId) || []
        const mostRecent = history[0] || null

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
            placementScore: scoreByUser.get(row.userId) ?? 200,
            ratingScore: ratingScoreByUser.get(row.userId) ?? null,
            seasonsPlayedCount: history.length,
            captainDivisionId: captainDivisionByUser.get(row.userId) || null,
            captainDivisionName:
                captainDivisionNameByUser.get(row.userId) || null,
            isCaptain: captainDivisionByUser.has(row.userId)
        }
    })

    candidates.sort(compareBaseCandidates)

    return {
        ok: true,
        data: {
            seasonId: config.seasonId,
            seasonLabel,
            divisions: divisionsWithMeta,
            candidates,
            excludedPlayers,
            draftsByUser,
            userIds
        }
    }
}

/** Division each user actually played in week 2 (first roster row wins). */
export async function loadWeek2DivisionByUser(seasonId: number) {
    const rows = await db
        .select({
            userId: week2Rosters.user,
            divisionId: week2Rosters.division
        })
        .from(week2Rosters)
        .where(eq(week2Rosters.season, seasonId))

    const result = new Map<string, number>()
    for (const row of rows) {
        if (!result.has(row.userId)) {
            result.set(row.userId, row.divisionId)
        }
    }
    return result
}

/** Forced moves (latest wins) and up/down recommendation counts. */
export async function loadMovingDayInputs(seasonId: number) {
    const [forcedRows, recommendationRows] = await Promise.all([
        db
            .select({
                userId: movingDay.player,
                direction: movingDay.direction
            })
            .from(movingDay)
            .where(
                and(
                    eq(movingDay.season, seasonId),
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
                    eq(movingDay.season, seasonId),
                    eq(movingDay.is_forced, false)
                )
            )
    ])

    const forcedMoveByUser = new Map<string, "up" | "down">()
    for (const row of forcedRows) {
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

    return { forcedMoveByUser, recommendationCountByUser }
}

/**
 * How many consecutive past seasons (counting backwards from the current
 * one) each user appeared in the top division's week-3 roster.
 */
export async function loadConsecutiveTopDivSeasons(
    seasonId: number,
    userIds: string[],
    topDivisionId: number | null
) {
    const [pastSeasonRows, topDivHistoryRows] = await Promise.all([
        db
            .select({ id: seasons.id })
            .from(seasons)
            .where(lt(seasons.id, seasonId))
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
    const result = new Map<string, number>()
    for (const userId of userIds) {
        const userSeasons = topDivSeasonsByUser.get(userId) ?? new Set<number>()
        let count = 0
        for (const pastSeasonId of pastSeasonIds) {
            if (userSeasons.has(pastSeasonId)) {
                count++
            } else {
                break
            }
        }
        result.set(userId, count)
    }
    return result
}
