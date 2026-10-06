import "server-only"

import { formatSeasonLabel } from "@/lib/season-utils"
import { logger } from "@/lib/logger"
import { db } from "@/database/db"
import {
    divisions,
    drafts,
    playerRatings,
    seasons,
    signups,
    teams,
    users,
    week1Rosters,
    week2Rosters,
    week3Rosters
} from "@/database/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import {
    getSeasonConfig,
    getEventsByType,
    formatEventTime
} from "@/lib/site-config"
import { getLeagueDateString } from "@/lib/date-utils"
import { getTeamRosterWithSubs } from "@/lib/roster"
import {
    getSessionUserId,
    hasCaptainPagesAccessBySession
} from "@/next/session"
import { withAction, ok, fail } from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"
import {
    buildTryoutTimeSlotGroups,
    resolveDefaultLookupType,
    sortPlayers,
    sortRatedPlayers
} from "./rate-player-helpers"
import type { TryoutTimeSlotGroup } from "./rate-player-helpers"

export type LookupType =
    | "direct"
    | "tryout1"
    | "tryout2"
    | "tryout2Times"
    | "tryout3"
    | "tryout3Times"
    | "byTeam"
    | "ratedPlayers"

export interface RatePlayerEntry {
    id: string
    oldId: number | null
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    height: number | null
    lastDivisionName: string | null
    picture: string | null
}

export interface PlayerRatingValues {
    overall: number | null
    passing: number | null
    setting: number | null
    hitting: number | null
    serving: number | null
    blocking: number | null
    sharedNotes: string | null
    privateNotes: string | null
}

// "Players I've Rated" lookup: one row per (player, season) the viewing
// evaluator has saved a rating or note for. ratedAt is the last save time.
export interface RatedPlayerEntry {
    player: RatePlayerEntry
    seasonId: number
    seasonLabel: string
    overall: number | null
    ratedAt: string | null
    // True when the player is a current-season signup, so the Rate dialog
    // (which always writes to the current season) can be opened for them.
    canRate: boolean
}

export interface RatedSeasonOption {
    seasonId: number
    label: string
}

export interface TryoutCourt {
    courtNumber: 1 | 2 | 3 | 4
    players: RatePlayerEntry[]
}

export interface TryoutSessionGroup {
    sessionNumber: number
    courts: TryoutCourt[]
}

export interface TryoutTeam {
    teamNumber: number
    players: RatePlayerEntry[]
}

export interface TryoutDivisionGroup {
    divisionName: string
    teams: TryoutTeam[]
}

// "By Team" lookup: real drafted season teams grouped under their division.
export interface SeasonTeamGroup {
    teamId: number
    teamName: string
    teamNumber: number | null
    players: RatePlayerEntry[]
}

export interface SeasonTeamDivisionGroup {
    divisionName: string
    teams: SeasonTeamGroup[]
}

// Points the "By Team" view at the team the viewing user captains, so it can
// open pre-expanded to that team. Null when the viewer captains no team.
export interface CaptainTeamRef {
    divisionName: string
    teamId: number
}

function buildDivisionGroups(
    rosterRows: Array<{
        userId: string
        divisionName: string
        divisionLevel: number
        teamNumber: number
    }>,
    playersById: Map<string, RatePlayerEntry>,
    lastDivisionByPlayerId: Map<string, string>
): TryoutDivisionGroup[] {
    const divisionMap = new Map<
        string,
        { level: number; teams: Map<number, RatePlayerEntry[]> }
    >()

    for (const row of rosterRows) {
        const player = playersById.get(row.userId)
        if (!player) continue

        if (!divisionMap.has(row.divisionName)) {
            divisionMap.set(row.divisionName, {
                level: row.divisionLevel,
                teams: new Map()
            })
        }

        const divEntry = divisionMap.get(row.divisionName)!
        if (!divEntry.teams.has(row.teamNumber)) {
            divEntry.teams.set(row.teamNumber, [])
        }
        divEntry.teams.get(row.teamNumber)!.push(player)
    }

    return [...divisionMap.entries()]
        .sort((a, b) => a[1].level - b[1].level)
        .map(([divisionName, { teams }]) => ({
            divisionName,
            teams: [...teams.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([teamNumber, players]) => ({
                    teamNumber,
                    players: [...players].sort((a, b) =>
                        sortPlayers(a, b, (p) =>
                            lastDivisionByPlayerId.has(p.id)
                        )
                    )
                }))
        }))
}

export interface RatePlayerData {
    seasonLabel: string
    players: RatePlayerEntry[]
    tryout1Sessions: TryoutSessionGroup[]
    tryout2Divisions: TryoutDivisionGroup[]
    tryout3Divisions: TryoutDivisionGroup[]
    tryout2TimeSlots: TryoutTimeSlotGroup[]
    tryout3TimeSlots: TryoutTimeSlotGroup[]
    byTeamDivisions: SeasonTeamDivisionGroup[]
    captainTeam: CaptainTeamRef | null
    defaultLookupType: LookupType
    ratingsByPlayer: Record<string, PlayerRatingValues>
    ratedPlayers: RatedPlayerEntry[]
    ratedSeasons: RatedSeasonOption[]
    currentSeasonId: number
}

export const getRatePlayerData = withAction(
    async (): Promise<ActionResult<RatePlayerData>> => {
        const hasAccess = await hasCaptainPagesAccessBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        const evaluatorId = await getSessionUserId()
        if (!evaluatorId) {
            return fail("Not authenticated.")
        }

        try {
            const config = await getSeasonConfig()
            if (!config.seasonId) {
                return fail("No active season found.")
            }

            const seasonLabel = formatSeasonLabel(config)

            const signupRows = await db
                .select({
                    id: users.id,
                    oldId: users.old_id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name,
                    male: users.male,
                    height: users.height,
                    picture: users.picture
                })
                .from(signups)
                .innerJoin(users, eq(signups.player, users.id))
                .where(eq(signups.season, config.seasonId))

            const playerIds = signupRows.map((row) => row.id)
            const signupIdSet = new Set(playerIds)

            // Every (player, season) this evaluator has rated, across all
            // seasons, for the "Players I've Rated" lookup. Rated players need
            // not be current-season signups, so their ids join the draft-history
            // lookup below.
            const ratedRows = await db
                .select({
                    seasonId: playerRatings.season,
                    seasonName: seasons.season,
                    seasonYear: seasons.year,
                    overall: playerRatings.overall,
                    ratedAt: playerRatings.updated_at,
                    id: users.id,
                    oldId: users.old_id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name,
                    male: users.male,
                    height: users.height,
                    picture: users.picture
                })
                .from(playerRatings)
                .innerJoin(seasons, eq(playerRatings.season, seasons.id))
                .innerJoin(users, eq(playerRatings.player, users.id))
                .where(eq(playerRatings.evaluator, evaluatorId))
                .orderBy(desc(playerRatings.updated_at))

            const historyIds = [
                ...new Set([...playerIds, ...ratedRows.map((row) => row.id)])
            ]

            const draftRows =
                historyIds.length === 0
                    ? []
                    : await db
                          .select({
                              userId: drafts.user,
                              divisionName: divisions.name,
                              draftId: drafts.id
                          })
                          .from(drafts)
                          .innerJoin(teams, eq(drafts.team, teams.id))
                          .innerJoin(
                              divisions,
                              eq(teams.division, divisions.id)
                          )
                          .where(inArray(drafts.user, historyIds))
                          .orderBy(desc(teams.season), desc(drafts.id))

            const lastDivisionByPlayerId = new Map<string, string>()
            for (const row of draftRows) {
                if (!lastDivisionByPlayerId.has(row.userId)) {
                    lastDivisionByPlayerId.set(row.userId, row.divisionName)
                }
            }

            const ratedPlayers = ratedRows
                .map(
                    (row): RatedPlayerEntry => ({
                        player: {
                            id: row.id,
                            oldId: row.oldId,
                            firstName: row.firstName,
                            lastName: row.lastName,
                            preferredName: row.preferredName,
                            male: row.male,
                            height: row.height,
                            picture: row.picture,
                            lastDivisionName:
                                lastDivisionByPlayerId.get(row.id) || null
                        },
                        seasonId: row.seasonId,
                        seasonLabel: formatSeasonLabel(row),
                        overall: row.overall,
                        ratedAt: row.ratedAt ? row.ratedAt.toISOString() : null,
                        canRate:
                            signupIdSet.has(row.id) && row.id !== evaluatorId
                    })
                )
                .sort(sortRatedPlayers)

            const ratedSeasonsById = new Map<number, RatedSeasonOption>()
            for (const entry of ratedPlayers) {
                if (!ratedSeasonsById.has(entry.seasonId)) {
                    ratedSeasonsById.set(entry.seasonId, {
                        seasonId: entry.seasonId,
                        label: entry.seasonLabel
                    })
                }
            }
            const ratedSeasons = [...ratedSeasonsById.values()].sort(
                (a, b) => b.seasonId - a.seasonId
            )

            if (signupRows.length === 0) {
                return ok({
                    seasonLabel,
                    players: [],
                    tryout1Sessions: [],
                    tryout2Divisions: [],
                    tryout3Divisions: [],
                    tryout2TimeSlots: [],
                    tryout3TimeSlots: [],
                    byTeamDivisions: [],
                    captainTeam: null,
                    defaultLookupType: "direct",
                    ratingsByPlayer: {},
                    ratedPlayers,
                    ratedSeasons,
                    currentSeasonId: config.seasonId
                })
            }

            const players = signupRows
                .filter((row) => row.id !== evaluatorId)
                .map(
                    (row): RatePlayerEntry => ({
                        id: row.id,
                        oldId: row.oldId,
                        firstName: row.firstName,
                        lastName: row.lastName,
                        preferredName: row.preferredName,
                        male: row.male,
                        height: row.height,
                        picture: row.picture,
                        lastDivisionName:
                            lastDivisionByPlayerId.get(row.id) || null
                    })
                )
                .sort((a, b) =>
                    sortPlayers(a, b, (p) => lastDivisionByPlayerId.has(p.id))
                )

            const playersById = new Map(
                players.map((player) => [player.id, player])
            )

            const ratingsByPlayer: Record<string, PlayerRatingValues> = {}

            const ratingRows = await db
                .select({
                    playerId: playerRatings.player,
                    overall: playerRatings.overall,
                    passing: playerRatings.passing,
                    setting: playerRatings.setting,
                    hitting: playerRatings.hitting,
                    serving: playerRatings.serving,
                    blocking: playerRatings.blocking,
                    sharedNotes: playerRatings.shared_notes,
                    privateNotes: playerRatings.private_notes
                })
                .from(playerRatings)
                .where(
                    and(
                        eq(playerRatings.season, config.seasonId),
                        eq(playerRatings.evaluator, evaluatorId),
                        inArray(playerRatings.player, playerIds)
                    )
                )

            for (const row of ratingRows) {
                ratingsByPlayer[row.playerId] = {
                    overall: row.overall,
                    passing: row.passing,
                    setting: row.setting,
                    hitting: row.hitting,
                    serving: row.serving,
                    blocking: row.blocking,
                    sharedNotes: row.sharedNotes,
                    privateNotes: row.privateNotes
                }
            }

            const rosterRows = await db
                .select({
                    userId: week1Rosters.user,
                    sessionNumber: week1Rosters.session_number,
                    courtNumber: week1Rosters.court_number
                })
                .from(week1Rosters)
                .where(eq(week1Rosters.season, config.seasonId))
                .orderBy(week1Rosters.session_number, week1Rosters.court_number)

            const sessionMap = new Map<
                number,
                Map<1 | 2 | 3 | 4, RatePlayerEntry[]>
            >()

            for (const row of rosterRows) {
                if (
                    row.courtNumber < 1 ||
                    row.courtNumber > 4 ||
                    row.sessionNumber <= 0
                ) {
                    continue
                }

                const player = playersById.get(row.userId)
                if (!player) {
                    continue
                }

                const courtNumber = row.courtNumber as 1 | 2 | 3 | 4

                if (!sessionMap.has(row.sessionNumber)) {
                    sessionMap.set(
                        row.sessionNumber,
                        new Map([
                            [1, []],
                            [2, []],
                            [3, []],
                            [4, []]
                        ])
                    )
                }

                sessionMap
                    .get(row.sessionNumber)!
                    .get(courtNumber)!
                    .push(player)
            }

            const tryout1Sessions: TryoutSessionGroup[] = [
                ...sessionMap.entries()
            ]
                .sort((a, b) => a[0] - b[0])
                .map(([sessionNumber, courtMap]) => ({
                    sessionNumber,
                    courts: ([1, 2, 3, 4] as const).map((courtNumber) => ({
                        courtNumber,
                        players: [...(courtMap.get(courtNumber) || [])].sort(
                            (a, b) =>
                                sortPlayers(a, b, (p) =>
                                    lastDivisionByPlayerId.has(p.id)
                                )
                        )
                    }))
                }))

            const [week2RosterRows, week3RosterRows] = await Promise.all([
                db
                    .select({
                        userId: week2Rosters.user,
                        divisionName: divisions.name,
                        divisionLevel: divisions.level,
                        teamNumber: week2Rosters.team_number
                    })
                    .from(week2Rosters)
                    .innerJoin(
                        divisions,
                        eq(week2Rosters.division, divisions.id)
                    )
                    .where(eq(week2Rosters.season, config.seasonId))
                    .orderBy(divisions.level, week2Rosters.team_number),
                db
                    .select({
                        userId: week3Rosters.user,
                        divisionName: divisions.name,
                        divisionLevel: divisions.level,
                        teamNumber: week3Rosters.team_number
                    })
                    .from(week3Rosters)
                    .innerJoin(
                        divisions,
                        eq(week3Rosters.division, divisions.id)
                    )
                    .where(eq(week3Rosters.season, config.seasonId))
                    .orderBy(divisions.level, week3Rosters.team_number)
            ])

            const tryout2Divisions = buildDivisionGroups(
                week2RosterRows,
                playersById,
                lastDivisionByPlayerId
            )
            const tryout3Divisions = buildDivisionGroups(
                week3RosterRows,
                playersById,
                lastDivisionByPlayerId
            )

            // "Tryout (times)" lookups: the same week 2/3 rosters re-grouped by
            // time slot (teams 1-2 play session 1, 3-4 session 2, 5-6 session 3).
            const tryoutEvents = getEventsByType(config, "tryout")
            const sessionTimeLabelsForWeek = (week: 2 | 3): string[] =>
                (tryoutEvents[week - 1]?.timeSlots ?? []).map((slot) =>
                    formatEventTime(slot.startTime)
                )
            const tryout2TimeSlots = buildTryoutTimeSlotGroups(
                week2RosterRows,
                playersById,
                lastDivisionByPlayerId,
                sessionTimeLabelsForWeek(2)
            )
            const tryout3TimeSlots = buildTryoutTimeSlotGroups(
                week3RosterRows,
                playersById,
                lastDivisionByPlayerId,
                sessionTimeLabelsForWeek(3)
            )

            // "By Team" — actual drafted season teams. Each team's roster is the
            // captain(s) plus drafted players with the permanent-sub chain resolved
            // to the currently-active player. Members are filtered through
            // playersById, which drops non-signups and the evaluator themselves.
            const teamRows = await db
                .select({
                    teamId: teams.id,
                    teamName: teams.name,
                    teamNumber: teams.number,
                    captain: teams.captain,
                    captain2: teams.captain2,
                    divisionName: divisions.name
                })
                .from(teams)
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .where(eq(teams.season, config.seasonId))
                .orderBy(divisions.level, teams.number)

            const byTeamDivisions: SeasonTeamDivisionGroup[] = []
            let captainTeam: CaptainTeamRef | null = null
            let draftStarted = false

            if (teamRows.length > 0) {
                const rosterEntries = await getTeamRosterWithSubs(
                    config.seasonId
                )
                draftStarted = rosterEntries.length > 0
                const activeUserIdsByTeam = new Map<number, Set<string>>()
                for (const entry of rosterEntries) {
                    const ids =
                        activeUserIdsByTeam.get(entry.teamId) ??
                        new Set<string>()
                    ids.add(entry.activeUser.id)
                    activeUserIdsByTeam.set(entry.teamId, ids)
                }

                const divisionOrder: string[] = []
                const teamsByDivision = new Map<string, SeasonTeamGroup[]>()

                for (const team of teamRows) {
                    if (
                        team.captain === evaluatorId ||
                        team.captain2 === evaluatorId
                    ) {
                        captainTeam = {
                            divisionName: team.divisionName,
                            teamId: team.teamId
                        }
                    }

                    const memberIds = new Set<string>([team.captain])
                    if (team.captain2) {
                        memberIds.add(team.captain2)
                    }
                    for (const id of activeUserIdsByTeam.get(team.teamId) ??
                        []) {
                        memberIds.add(id)
                    }

                    const teamPlayers: RatePlayerEntry[] = []
                    for (const id of memberIds) {
                        const player = playersById.get(id)
                        if (player) {
                            teamPlayers.push(player)
                        }
                    }
                    teamPlayers.sort((a, b) =>
                        sortPlayers(a, b, (p) =>
                            lastDivisionByPlayerId.has(p.id)
                        )
                    )

                    if (!teamsByDivision.has(team.divisionName)) {
                        teamsByDivision.set(team.divisionName, [])
                        divisionOrder.push(team.divisionName)
                    }
                    teamsByDivision.get(team.divisionName)!.push({
                        teamId: team.teamId,
                        teamName: team.teamName,
                        teamNumber: team.teamNumber,
                        players: teamPlayers
                    })
                }

                for (const divisionName of divisionOrder) {
                    byTeamDivisions.push({
                        divisionName,
                        teams: teamsByDivision.get(divisionName)!
                    })
                }
            }

            return ok({
                seasonLabel,
                players,
                tryout1Sessions,
                tryout2Divisions,
                tryout3Divisions,
                tryout2TimeSlots,
                tryout3TimeSlots,
                byTeamDivisions,
                captainTeam,
                defaultLookupType: resolveDefaultLookupType({
                    phase: config.phase,
                    tryoutDates: tryoutEvents.map((event) => event.eventDate),
                    today: getLeagueDateString(),
                    draftStarted,
                    byTeamAvailable: byTeamDivisions.length > 0
                }),
                ratingsByPlayer,
                ratedPlayers,
                ratedSeasons,
                currentSeasonId: config.seasonId
            })
        } catch (error) {
            logger.error("Error loading rate player data", undefined, error)
            return fail("Something went wrong.")
        }
    }
)
