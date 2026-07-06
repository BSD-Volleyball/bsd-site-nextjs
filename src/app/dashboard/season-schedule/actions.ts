"use server"

import { db } from "@/database/db"
import {
    divisions,
    matches,
    matchReferees,
    seasons,
    teams,
    drafts,
    seasonEvents,
    users
} from "@/database/schema"
import { and, asc, eq, inArray } from "drizzle-orm"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requirePositiveInt
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"
import {
    computeStandings,
    getSetScores,
    type StandingTeam
} from "@/lib/team-ranking"

export interface WeekMatchLine {
    id: number
    time: string | null
    court: number | null
    matchLabel: string
    homeTeamLabel: string
    awayTeamLabel: string
    homeTeamId: number
    awayTeamId: number
    winnerName: string | null
    winnerTeamId: number | null
    winnerGames: number | null
    loserName: string | null
    loserTeamId: number | null
    loserGames: number | null
    scoresDisplay: string
    refName: string | null
}

interface WeekRow {
    week: number
    date: string | null
    matches: WeekMatchLine[]
}

export interface CurrentSeasonScheduleDivision {
    id: number
    name: string
    level: number
    isDrafted: boolean
    standings: StandingTeam[]
    weeks: WeekRow[]
}

interface CurrentSeasonScheduleData {
    seasonLabel: string
    divisions: CurrentSeasonScheduleDivision[]
    userTeamId: number | null
    userDivisionId: number | null
}

function parseTimeForSort(time: string | null): number {
    if (!time) return Number.MAX_SAFE_INTEGER
    const match = time.match(/^(\d{1,2}):(\d{2})/)
    if (!match) return Number.MAX_SAFE_INTEGER
    const hour = Number.parseInt(match[1], 10)
    const minute = Number.parseInt(match[2], 10)
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
        return Number.MAX_SAFE_INTEGER
    }
    return hour * 60 + minute
}

export const getCurrentSeasonScheduleData = withAction(
    async (
        seasonId: number
    ): Promise<ActionResult<CurrentSeasonScheduleData>> => {
        const session = await requireSession()
        const userId = session.user.id
        requirePositiveInt(seasonId, "Season")

        const [seasonRow] = await db
            .select({ year: seasons.year, season: seasons.season })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1)

        if (!seasonRow) {
            return fail("Season not found.")
        }

        const seasonLabel = `${seasonRow.season.charAt(0).toUpperCase() + seasonRow.season.slice(1)} ${seasonRow.year}`

        const [userDraftRow, teamRows] = await Promise.all([
            db
                .select({ teamId: teams.id, divisionId: teams.division })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .where(and(eq(drafts.user, userId), eq(teams.season, seasonId)))
                .limit(1),
            db
                .select({
                    id: teams.id,
                    number: teams.number,
                    name: teams.name,
                    divisionId: teams.division
                })
                .from(teams)
                .where(eq(teams.season, seasonId))
                .orderBy(teams.division, teams.number)
        ])

        const userTeamId = userDraftRow[0]?.teamId ?? null
        const userDivisionId = userDraftRow[0]?.divisionId ?? null

        if (teamRows.length === 0) {
            return ok({
                seasonLabel,
                divisions: [],
                userTeamId,
                userDivisionId
            })
        }

        const divisionIds = [...new Set(teamRows.map((t) => t.divisionId))]
        const teamIds = teamRows.map((t) => t.id)

        // Find which divisions have any drafted player
        const draftedTeamRows = await db
            .select({ teamId: drafts.team })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(
                and(
                    eq(teams.season, seasonId),
                    inArray(teams.division, divisionIds)
                )
            )

        const draftedTeamIds = new Set(draftedTeamRows.map((r) => r.teamId))
        const draftedDivisionIds = new Set(
            teamRows
                .filter((t) => draftedTeamIds.has(t.id))
                .map((t) => t.divisionId)
        )

        const [divisionRows, matchRows, rsEventRows, refRows] =
            await Promise.all([
                db
                    .select({
                        id: divisions.id,
                        name: divisions.name,
                        level: divisions.level
                    })
                    .from(divisions)
                    .where(inArray(divisions.id, divisionIds))
                    .orderBy(divisions.level),
                db
                    .select({
                        id: matches.id,
                        divisionId: matches.division,
                        week: matches.week,
                        date: matches.date,
                        time: matches.time,
                        court: matches.court,
                        homeTeamId: matches.home_team,
                        awayTeamId: matches.away_team,
                        homeScore: matches.home_score,
                        awayScore: matches.away_score,
                        home_set1_score: matches.home_set1_score,
                        away_set1_score: matches.away_set1_score,
                        home_set2_score: matches.home_set2_score,
                        away_set2_score: matches.away_set2_score,
                        home_set3_score: matches.home_set3_score,
                        away_set3_score: matches.away_set3_score
                    })
                    .from(matches)
                    .where(
                        and(
                            eq(matches.season, seasonId),
                            inArray(matches.division, divisionIds),
                            eq(matches.playoff, false),
                            inArray(matches.home_team, teamIds),
                            inArray(matches.away_team, teamIds)
                        )
                    ),
                db
                    .select({ eventDate: seasonEvents.event_date })
                    .from(seasonEvents)
                    .where(
                        and(
                            eq(seasonEvents.season_id, seasonId),
                            eq(seasonEvents.event_type, "regular_season")
                        )
                    )
                    .orderBy(asc(seasonEvents.event_date)),
                db
                    .select({
                        matchId: matchReferees.match_id,
                        refName: users.name
                    })
                    .from(matchReferees)
                    .innerJoin(users, eq(matchReferees.referee_id, users.id))
                    .where(eq(matchReferees.season_id, seasonId))
            ])

        // Build week number → date fallback from season_events (week 1 = first event, etc.)
        const weekToDate = new Map<number, string>()
        rsEventRows.forEach((e, idx) => {
            weekToDate.set(idx + 1, e.eventDate)
        })

        const refByMatchId = new Map(refRows.map((r) => [r.matchId, r.refName]))

        const teamById = new Map(teamRows.map((t) => [t.id, t]))
        const teamsByDivision = new Map<number, typeof teamRows>()
        for (const team of teamRows) {
            const arr = teamsByDivision.get(team.divisionId) ?? []
            arr.push(team)
            teamsByDivision.set(team.divisionId, arr)
        }

        const matchesByDivision = new Map<number, typeof matchRows>()
        for (const row of matchRows) {
            const arr = matchesByDivision.get(row.divisionId) ?? []
            arr.push(row)
            matchesByDivision.set(row.divisionId, arr)
        }

        const divisionData: CurrentSeasonScheduleDivision[] = divisionRows.map(
            (division) => {
                const isDrafted = draftedDivisionIds.has(division.id)
                const divisionTeams = teamsByDivision.get(division.id) ?? []
                const divisionMatches = matchesByDivision.get(division.id) ?? []

                // Resolve display name: real name for drafted divisions, "Team X" for undrafted
                const displayName = (team: {
                    number: number | null
                    name: string
                }) =>
                    isDrafted
                        ? team.name
                        : team.number !== null
                          ? `Team ${team.number}`
                          : team.name

                const rankableTeams = divisionTeams.map((t) => ({
                    id: t.id,
                    number: t.number,
                    name: displayName(t)
                }))
                const standings = computeStandings(
                    rankableTeams,
                    divisionMatches
                )

                const weeksMap = new Map<number, WeekRow>()
                for (const match of divisionMatches) {
                    if (match.homeTeamId === null || match.awayTeamId === null)
                        continue
                    const homeTeam = teamById.get(match.homeTeamId)
                    const awayTeam = teamById.get(match.awayTeamId)
                    if (!homeTeam || !awayTeam) continue

                    const week = match.week
                    const existing = weeksMap.get(week) ?? {
                        week,
                        date: match.date ?? weekToDate.get(week) ?? null,
                        matches: []
                    }

                    const setScores = getSetScores(match)
                    let homeGames = 0
                    let awayGames = 0
                    for (const set of setScores) {
                        if (set.home > set.away) homeGames++
                        else if (set.away > set.home) awayGames++
                    }
                    const hasResult =
                        setScores.length > 0 ||
                        (match.homeScore !== null && match.awayScore !== null)
                    if (setScores.length === 0 && hasResult) {
                        homeGames = match.homeScore || 0
                        awayGames = match.awayScore || 0
                    }

                    const homeWinsMatch = homeGames >= awayGames
                    const homeDisplayName = displayName(homeTeam)
                    const awayDisplayName = displayName(awayTeam)
                    const useTeamNumbers =
                        homeTeam.number !== null && awayTeam.number !== null
                    const homeTeamLabel = useTeamNumbers
                        ? `${homeTeam.number}`
                        : homeDisplayName
                    const awayTeamLabel = useTeamNumbers
                        ? `${awayTeam.number}`
                        : awayDisplayName
                    const winnerName = hasResult
                        ? homeWinsMatch
                            ? homeDisplayName
                            : awayDisplayName
                        : null
                    const loserName = hasResult
                        ? homeWinsMatch
                            ? awayDisplayName
                            : homeDisplayName
                        : null
                    const winnerGames = hasResult
                        ? homeWinsMatch
                            ? homeGames
                            : awayGames
                        : null
                    const loserGames = hasResult
                        ? homeWinsMatch
                            ? awayGames
                            : homeGames
                        : null

                    const scoresDisplay = setScores
                        .map((set) =>
                            homeWinsMatch
                                ? `${set.home}-${set.away}`
                                : `${set.away}-${set.home}`
                        )
                        .join(", ")

                    existing.matches.push({
                        id: match.id,
                        time: match.time,
                        court: match.court,
                        matchLabel: `${homeTeamLabel} vs ${awayTeamLabel}`,
                        homeTeamLabel,
                        awayTeamLabel,
                        homeTeamId: match.homeTeamId,
                        awayTeamId: match.awayTeamId,
                        winnerName,
                        winnerTeamId: hasResult
                            ? homeWinsMatch
                                ? match.homeTeamId
                                : match.awayTeamId
                            : null,
                        winnerGames,
                        loserName,
                        loserTeamId: hasResult
                            ? homeWinsMatch
                                ? match.awayTeamId
                                : match.homeTeamId
                            : null,
                        loserGames,
                        scoresDisplay,
                        refName: refByMatchId.get(match.id) ?? null
                    })
                    weeksMap.set(week, existing)
                }

                const weeks = [...weeksMap.values()]
                    .sort((a, b) => a.week - b.week)
                    .map((weekRow) => ({
                        ...weekRow,
                        matches: [...weekRow.matches].sort((a, b) => {
                            const timeCmp =
                                parseTimeForSort(a.time) -
                                parseTimeForSort(b.time)
                            if (timeCmp !== 0) return timeCmp
                            return (a.court || 0) - (b.court || 0)
                        })
                    }))

                return {
                    id: division.id,
                    name: division.name,
                    level: division.level,
                    isDrafted,
                    standings,
                    weeks
                }
            }
        )

        return ok({
            seasonLabel,
            divisions: divisionData,
            userTeamId,
            userDivisionId
        })
    }
)
