import "server-only"

import { and, eq, or } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    drafts,
    individual_divisions,
    teams,
    users,
    week1Rosters,
    week2Rosters,
    week3Rosters
} from "@/database/schema"
import { isCommissionerForSeason } from "@/lib/rbac"
import {
    formatEventTime,
    getEventsByType,
    type SeasonConfig
} from "@/lib/site-config"
import { formatDisplayName } from "@/lib/utils"
import {
    getNextMatch,
    getPlayoffNextMatches,
    type NextMatch,
    type PlayoffNextMatchData
} from "../next-match-data"
import {
    getAllDivisionCaptainSelectionStatus,
    getCommissionerCaptainSelectionStatus,
    type CaptainSelectionDivisionStatus
} from "../queries"
import {
    getCaptainWelcomeData,
    getPlayerTeamAssignment,
    type CaptainWelcomeData,
    type PlayerTeamAssignment
} from "../roster-data"

// Everything on the dashboard home that follows the season through its
// phases: preseason roster slots, captain/coach status, team assignment,
// next match and captain selection progress. Takes the caller's own user id,
// resolved from the session by the page.

export interface Week1RosterSlot {
    sessionNumber: number
    courtNumber: number
}

export interface TryoutTeamRoster {
    divisionName: string
    teamNumber: number
    captainName: string | null
    courtNumber: number
    sessionTime: string
}

export interface SeasonProgress {
    isCurrentSeasonCommissioner: boolean
    hasWeek1RosterData: boolean
    hasWeek2RosterData: boolean
    hasWeek3RosterData: boolean
    isWeek2Captain: boolean
    isSeasonCaptain: boolean
    isSeasonCoach: boolean
    isDivisionDrafted: boolean
    captainWelcomeData: CaptainWelcomeData | null
    playerTeamAssignment: PlayerTeamAssignment | null
    nextMatch: NextMatch | null
    playoffNextMatches: PlayoffNextMatchData | null
    userWeek1Roster: Week1RosterSlot | null
    userWeek2Roster: TryoutTeamRoster | null
    userWeek3Roster: TryoutTeamRoster | null
    commissionerCaptainStatuses: CaptainSelectionDivisionStatus[]
    adminCaptainStatuses: CaptainSelectionDivisionStatus[]
}

export const EMPTY_SEASON_PROGRESS: SeasonProgress = {
    isCurrentSeasonCommissioner: false,
    hasWeek1RosterData: false,
    hasWeek2RosterData: false,
    hasWeek3RosterData: false,
    isWeek2Captain: false,
    isSeasonCaptain: false,
    isSeasonCoach: false,
    isDivisionDrafted: false,
    captainWelcomeData: null,
    playerTeamAssignment: null,
    nextMatch: null,
    playoffNextMatches: null,
    userWeek1Roster: null,
    userWeek2Roster: null,
    userWeek3Roster: null,
    commissionerCaptainStatuses: [],
    adminCaptainStatuses: []
}

const LEGACY_COURT_BY_DIVISION: Record<string, number> = {
    AA: 1,
    A: 2,
    ABA: 3,
    ABB: 4,
    BB: 7,
    BBB: 8
}

// Shared tail of the week 2 and week 3 lookups: court from the legacy
// division map (else the division's position by level), session time from
// the matching tryout event's time slots (two teams per matchup).
function buildTryoutTeamRoster(
    config: SeasonConfig,
    tryoutIndex: number,
    slot: { divisionId: number; divisionName: string; teamNumber: number },
    captainRow:
        | {
              firstName: string
              lastName: string
              preferredName: string | null
          }
        | undefined,
    weekDivisions: { id: number }[]
): TryoutTeamRoster {
    const divisionIndex = weekDivisions.findIndex(
        (d) => d.id === slot.divisionId
    )
    const courtNumber =
        LEGACY_COURT_BY_DIVISION[slot.divisionName] ??
        (divisionIndex >= 0 ? divisionIndex + 1 : 1)

    const tryoutEvents = getEventsByType(config, "tryout")
    const tryoutTimeSlots = tryoutEvents[tryoutIndex]?.timeSlots ?? []
    const sessionTimes = tryoutTimeSlots.map((ts) =>
        formatEventTime(ts.startTime)
    )
    const matchupIndex = Math.floor((slot.teamNumber - 1) / 2)
    const sessionTime = sessionTimes[matchupIndex] || "TBD"

    const captainName = captainRow
        ? formatDisplayName(
              captainRow.firstName,
              captainRow.lastName,
              captainRow.preferredName
          )
        : null

    return {
        divisionName: slot.divisionName,
        teamNumber: slot.teamNumber,
        captainName,
        courtNumber,
        sessionTime
    }
}

async function loadWeek2Roster(
    userId: string,
    config: SeasonConfig,
    seasonId: number
): Promise<TryoutTeamRoster | null> {
    const [myWeek2Slot] = await db
        .select({
            divisionId: week2Rosters.division,
            divisionName: divisions.name,
            teamNumber: week2Rosters.team_number
        })
        .from(week2Rosters)
        .innerJoin(divisions, eq(week2Rosters.division, divisions.id))
        .where(
            and(
                eq(week2Rosters.season, seasonId),
                eq(week2Rosters.user, userId)
            )
        )
        .limit(1)

    if (!myWeek2Slot) return null

    const [[captainRow], week2Divisions] = await Promise.all([
        db
            .select({
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(week2Rosters)
            .innerJoin(users, eq(week2Rosters.user, users.id))
            .where(
                and(
                    eq(week2Rosters.season, seasonId),
                    eq(week2Rosters.division, myWeek2Slot.divisionId),
                    eq(week2Rosters.team_number, myWeek2Slot.teamNumber),
                    eq(week2Rosters.is_captain, true)
                )
            )
            .limit(1),
        db
            .selectDistinct({
                id: divisions.id,
                level: divisions.level
            })
            .from(week2Rosters)
            .innerJoin(divisions, eq(week2Rosters.division, divisions.id))
            .where(eq(week2Rosters.season, seasonId))
            .orderBy(divisions.level)
    ])

    return buildTryoutTeamRoster(
        config,
        1,
        myWeek2Slot,
        captainRow,
        week2Divisions
    )
}

async function loadWeek3Roster(
    userId: string,
    config: SeasonConfig,
    seasonId: number
): Promise<TryoutTeamRoster | null> {
    const [myWeek3Slot] = await db
        .select({
            divisionId: week3Rosters.division,
            divisionName: divisions.name,
            teamNumber: week3Rosters.team_number
        })
        .from(week3Rosters)
        .innerJoin(divisions, eq(week3Rosters.division, divisions.id))
        .where(
            and(
                eq(week3Rosters.season, seasonId),
                eq(week3Rosters.user, userId)
            )
        )
        .limit(1)

    if (!myWeek3Slot) return null

    const [[captainRow], week3Divisions] = await Promise.all([
        db
            .select({
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(week3Rosters)
            .innerJoin(users, eq(week3Rosters.user, users.id))
            .where(
                and(
                    eq(week3Rosters.season, seasonId),
                    eq(week3Rosters.division, myWeek3Slot.divisionId),
                    eq(week3Rosters.team_number, myWeek3Slot.teamNumber),
                    eq(week3Rosters.is_captain, true)
                )
            )
            .limit(1),
        db
            .selectDistinct({
                id: divisions.id,
                level: divisions.level
            })
            .from(week3Rosters)
            .innerJoin(divisions, eq(week3Rosters.division, divisions.id))
            .where(eq(week3Rosters.season, seasonId))
            .orderBy(divisions.level)
    ])

    return buildTryoutTeamRoster(
        config,
        2,
        myWeek3Slot,
        captainRow,
        week3Divisions
    )
}

export async function loadSeasonProgress(
    userId: string,
    config: SeasonConfig,
    isAdmin: boolean
): Promise<SeasonProgress> {
    const progress: SeasonProgress = { ...EMPTY_SEASON_PROGRESS }
    const seasonId = config.seasonId
    const phase = config.phase

    const [week1RosterRow, week2RosterRow, week3RosterRow, isCommissioner] =
        await Promise.all([
            db
                .select({ id: week1Rosters.id })
                .from(week1Rosters)
                .where(eq(week1Rosters.season, seasonId))
                .limit(1),
            db
                .select({ id: week2Rosters.id })
                .from(week2Rosters)
                .where(eq(week2Rosters.season, seasonId))
                .limit(1),
            db
                .select({ id: week3Rosters.id })
                .from(week3Rosters)
                .where(eq(week3Rosters.season, seasonId))
                .limit(1),
            isCommissionerForSeason(userId, seasonId)
        ])
    progress.hasWeek1RosterData = !!week1RosterRow[0]
    progress.hasWeek2RosterData = !!week2RosterRow[0]
    progress.hasWeek3RosterData = !!week3RosterRow[0]
    progress.isCurrentSeasonCommissioner = isCommissioner

    if (phase === "prep_tryout_week_1") {
        const [myWeek1Slot] = await db
            .select({
                sessionNumber: week1Rosters.session_number,
                courtNumber: week1Rosters.court_number
            })
            .from(week1Rosters)
            .where(
                and(
                    eq(week1Rosters.season, seasonId),
                    eq(week1Rosters.user, userId)
                )
            )
            .limit(1)
        progress.userWeek1Roster = myWeek1Slot ?? null
    }

    if (phase === "prep_tryout_week_3" && progress.hasWeek2RosterData) {
        const [week2CaptainEntry] = await db
            .select({ userId: week2Rosters.user })
            .from(week2Rosters)
            .where(
                and(
                    eq(week2Rosters.season, seasonId),
                    eq(week2Rosters.user, userId),
                    eq(week2Rosters.is_captain, true)
                )
            )
            .limit(1)
        progress.isWeek2Captain = !!week2CaptainEntry
    }

    if (
        ["prep_tryout_week_3", "draft", "regular_season", "playoffs"].includes(
            phase
        )
    ) {
        const [captainTeamEntry] = await db
            .select({ id: teams.id, divisionId: teams.division })
            .from(teams)
            .where(and(eq(teams.season, seasonId), eq(teams.captain, userId)))
            .limit(1)
        progress.isSeasonCaptain = !!captainTeamEntry

        // Check for coaches (captain or captain2 in a coaches-mode division)
        let teamCardEntry = captainTeamEntry
        if (!progress.isSeasonCaptain) {
            const [coachTeamEntry] = await db
                .select({ id: teams.id, divisionId: teams.division })
                .from(teams)
                .innerJoin(
                    individual_divisions,
                    and(
                        eq(individual_divisions.season, seasonId),
                        eq(individual_divisions.division, teams.division),
                        eq(individual_divisions.coaches, true)
                    )
                )
                .where(
                    and(
                        eq(teams.season, seasonId),
                        or(
                            eq(teams.captain, userId),
                            eq(teams.captain2, userId)
                        )
                    )
                )
                .limit(1)
            progress.isSeasonCoach = !!coachTeamEntry
            teamCardEntry = coachTeamEntry
        }

        if (
            (progress.isSeasonCaptain || progress.isSeasonCoach) &&
            teamCardEntry
        ) {
            const [draftRecord] = await db
                .select({ id: drafts.id })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .where(
                    and(
                        eq(teams.season, seasonId),
                        eq(teams.division, teamCardEntry.divisionId)
                    )
                )
                .limit(1)
            progress.isDivisionDrafted = !!draftRecord
        }

        if (
            (progress.isSeasonCaptain || progress.isSeasonCoach) &&
            progress.isDivisionDrafted
        ) {
            progress.captainWelcomeData = await getCaptainWelcomeData()
        }
    }

    if (["draft", "regular_season", "playoffs", "complete"].includes(phase)) {
        progress.playerTeamAssignment = await getPlayerTeamAssignment(
            userId,
            seasonId
        )
    }

    if (["draft", "regular_season", "playoffs"].includes(phase)) {
        progress.nextMatch = await getNextMatch(userId, seasonId)
    }

    if (phase === "playoffs") {
        progress.playoffNextMatches = await getPlayoffNextMatches(
            userId,
            seasonId
        )
    }

    if (phase === "prep_tryout_week_2" && progress.hasWeek2RosterData) {
        progress.userWeek2Roster = await loadWeek2Roster(
            userId,
            config,
            seasonId
        )
    }

    if (phase === "prep_tryout_week_3" && progress.hasWeek3RosterData) {
        progress.userWeek3Roster = await loadWeek3Roster(
            userId,
            config,
            seasonId
        )
    }

    if (phase === "select_captains") {
        if (isAdmin) {
            progress.adminCaptainStatuses =
                await getAllDivisionCaptainSelectionStatus(seasonId)
        } else if (progress.isCurrentSeasonCommissioner) {
            progress.commissionerCaptainStatuses =
                await getCommissionerCaptainSelectionStatus(userId, seasonId)
        }
    }

    return progress
}
