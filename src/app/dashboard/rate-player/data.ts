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
    resolveDefaultLookupType
} from "./rate-player-helpers"
import type { TryoutTimeSlotGroup } from "./rate-player-helpers"
import {
    buildByTeamDivisions,
    buildDivisionGroups,
    buildPlayerEntries,
    buildRatedPlayers,
    buildRatedSeasons,
    buildTryout1Sessions,
    latestDivisionByPlayer
} from "./rate-player-groups"

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

/** Current-season signups joined to their user rows. */
async function loadSignupUsers(seasonId: number) {
    return db
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
        .where(eq(signups.season, seasonId))
}

/**
 * Every (player, season) this evaluator has rated, across all seasons, for
 * the "Players I've Rated" lookup, newest first. Rated players need not be
 * current-season signups.
 */
async function loadRatedRows(evaluatorId: string) {
    return db
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
}

/** Each player's most recent drafted division, by user id. */
async function loadLastDivisionByPlayer(
    historyIds: string[]
): Promise<Map<string, string>> {
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
                  .innerJoin(divisions, eq(teams.division, divisions.id))
                  .where(inArray(drafts.user, historyIds))
                  .orderBy(desc(teams.season), desc(drafts.id))
    return latestDivisionByPlayer(draftRows)
}

/** The evaluator's current-season ratings of the given players. */
async function loadRatingsByPlayer(
    seasonId: number,
    evaluatorId: string,
    playerIds: string[]
): Promise<Record<string, PlayerRatingValues>> {
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
                eq(playerRatings.season, seasonId),
                eq(playerRatings.evaluator, evaluatorId),
                inArray(playerRatings.player, playerIds)
            )
        )

    const ratingsByPlayer: Record<string, PlayerRatingValues> = {}
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
    return ratingsByPlayer
}

async function loadWeek1RosterRows(seasonId: number) {
    return db
        .select({
            userId: week1Rosters.user,
            sessionNumber: week1Rosters.session_number,
            courtNumber: week1Rosters.court_number
        })
        .from(week1Rosters)
        .where(eq(week1Rosters.season, seasonId))
        .orderBy(week1Rosters.session_number, week1Rosters.court_number)
}

async function loadWeek2And3RosterRows(seasonId: number) {
    return Promise.all([
        db
            .select({
                userId: week2Rosters.user,
                divisionName: divisions.name,
                divisionLevel: divisions.level,
                teamNumber: week2Rosters.team_number
            })
            .from(week2Rosters)
            .innerJoin(divisions, eq(week2Rosters.division, divisions.id))
            .where(eq(week2Rosters.season, seasonId))
            .orderBy(divisions.level, week2Rosters.team_number),
        db
            .select({
                userId: week3Rosters.user,
                divisionName: divisions.name,
                divisionLevel: divisions.level,
                teamNumber: week3Rosters.team_number
            })
            .from(week3Rosters)
            .innerJoin(divisions, eq(week3Rosters.division, divisions.id))
            .where(eq(week3Rosters.season, seasonId))
            .orderBy(divisions.level, week3Rosters.team_number)
    ])
}

/**
 * "By Team": the actual drafted season teams, the viewer's own team, and
 * whether drafting has started (any draft pick exists).
 */
async function loadByTeam(
    seasonId: number,
    evaluatorId: string,
    playersById: Map<string, RatePlayerEntry>,
    lastDivisionByPlayerId: Map<string, string>
): Promise<{
    byTeamDivisions: SeasonTeamDivisionGroup[]
    captainTeam: CaptainTeamRef | null
    draftStarted: boolean
}> {
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
        .where(eq(teams.season, seasonId))
        .orderBy(divisions.level, teams.number)

    if (teamRows.length === 0) {
        return { byTeamDivisions: [], captainTeam: null, draftStarted: false }
    }

    const rosterEntries = await getTeamRosterWithSubs(seasonId)
    return {
        ...buildByTeamDivisions(
            teamRows,
            rosterEntries,
            evaluatorId,
            playersById,
            lastDivisionByPlayerId
        ),
        draftStarted: rosterEntries.length > 0
    }
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
            const seasonId = config.seasonId
            const seasonLabel = formatSeasonLabel(config)

            // The season's signups and the viewer's rating history are
            // independent reads.
            const [signupRows, ratedRows] = await Promise.all([
                loadSignupUsers(seasonId),
                loadRatedRows(evaluatorId)
            ])

            const playerIds = signupRows.map((row) => row.id)
            const lastDivisionByPlayerId = await loadLastDivisionByPlayer([
                ...new Set([...playerIds, ...ratedRows.map((row) => row.id)])
            ])

            const ratedPlayers = buildRatedPlayers(
                ratedRows,
                lastDivisionByPlayerId,
                new Set(playerIds),
                evaluatorId
            )
            const ratedSeasons = buildRatedSeasons(ratedPlayers)

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
                    currentSeasonId: seasonId
                })
            }

            const players = buildPlayerEntries(
                signupRows,
                evaluatorId,
                lastDivisionByPlayerId
            )
            const playersById = new Map(
                players.map((player) => [player.id, player])
            )

            // Ratings, the three tryout rosters and the season teams each
            // read their own tables and need only the ids resolved above.
            const [
                ratingsByPlayer,
                week1RosterRows,
                [week2RosterRows, week3RosterRows],
                { byTeamDivisions, captainTeam, draftStarted }
            ] = await Promise.all([
                loadRatingsByPlayer(seasonId, evaluatorId, playerIds),
                loadWeek1RosterRows(seasonId),
                loadWeek2And3RosterRows(seasonId),
                loadByTeam(
                    seasonId,
                    evaluatorId,
                    playersById,
                    lastDivisionByPlayerId
                )
            ])

            // "Tryout (times)" lookups: the same week 2/3 rosters re-grouped by
            // time slot (teams 1-2 play session 1, 3-4 session 2, 5-6 session 3).
            const tryoutEvents = getEventsByType(config, "tryout")
            const sessionTimeLabelsForWeek = (week: 2 | 3): string[] =>
                (tryoutEvents[week - 1]?.timeSlots ?? []).map((slot) =>
                    formatEventTime(slot.startTime)
                )

            return ok({
                seasonLabel,
                players,
                tryout1Sessions: buildTryout1Sessions(
                    week1RosterRows,
                    playersById,
                    lastDivisionByPlayerId
                ),
                tryout2Divisions: buildDivisionGroups(
                    week2RosterRows,
                    playersById,
                    lastDivisionByPlayerId
                ),
                tryout3Divisions: buildDivisionGroups(
                    week3RosterRows,
                    playersById,
                    lastDivisionByPlayerId
                ),
                tryout2TimeSlots: buildTryoutTimeSlotGroups(
                    week2RosterRows,
                    playersById,
                    lastDivisionByPlayerId,
                    sessionTimeLabelsForWeek(2)
                ),
                tryout3TimeSlots: buildTryoutTimeSlotGroups(
                    week3RosterRows,
                    playersById,
                    lastDivisionByPlayerId,
                    sessionTimeLabelsForWeek(3)
                ),
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
                currentSeasonId: seasonId
            })
        } catch (error) {
            logger.error("Error loading rate player data", undefined, error)
            return fail("Something went wrong.")
        }
    }
)
