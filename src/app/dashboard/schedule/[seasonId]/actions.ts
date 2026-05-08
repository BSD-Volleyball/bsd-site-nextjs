"use server"

import { db } from "@/database/db"
import {
    divisions,
    matches,
    matchReferees,
    seasons,
    teams,
    users
} from "@/database/schema"
import { and, eq, inArray } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import {
    computeStandings,
    getSetScores,
    type StandingTeam
} from "@/lib/team-ranking"

interface WeekMatchLine {
    id: number
    time: string | null
    court: number | null
    matchLabel: string
    winnerName: string | null
    winnerGames: number | null
    loserName: string | null
    loserGames: number | null
    scoresDisplay: string
    refName: string | null
}

interface WeekRow {
    week: number
    date: string | null
    matches: WeekMatchLine[]
}

export interface ScheduleDivision {
    id: number
    name: string
    level: number
    standings: StandingTeam[]
    weeks: WeekRow[]
}

interface ScheduleData {
    status: boolean
    message?: string
    seasonLabel: string
    divisions: ScheduleDivision[]
}

function parseTimeForSort(time: string | null): number {
    if (!time) return Number.MAX_SAFE_INTEGER
    const match = time.match(/^(\d{1,2}):(\d{2})$/)
    if (!match) return Number.MAX_SAFE_INTEGER
    const hour = Number.parseInt(match[1], 10)
    const minute = Number.parseInt(match[2], 10)
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
        return Number.MAX_SAFE_INTEGER
    }
    return hour * 60 + minute
}

export async function getSeasonScheduleData(
    seasonId: number
): Promise<ScheduleData> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return {
            status: false,
            message: "Not authenticated.",
            seasonLabel: "",
            divisions: []
        }
    }

    if (!Number.isInteger(seasonId) || seasonId <= 0) {
        return {
            status: false,
            message: "Invalid season.",
            seasonLabel: "",
            divisions: []
        }
    }

    try {
        const [seasonRow] = await db
            .select({
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1)

        if (!seasonRow) {
            return {
                status: false,
                message: "Season not found.",
                seasonLabel: "",
                divisions: []
            }
        }

        const seasonLabel = `${seasonRow.season.charAt(0).toUpperCase() + seasonRow.season.slice(1)} ${seasonRow.year}`

        const teamRows = await db
            .select({
                id: teams.id,
                number: teams.number,
                name: teams.name,
                divisionId: teams.division
            })
            .from(teams)
            .where(eq(teams.season, seasonId))
            .orderBy(teams.division, teams.number)

        if (teamRows.length === 0) {
            return {
                status: true,
                seasonLabel,
                divisions: []
            }
        }

        const divisionIds = [...new Set(teamRows.map((t) => t.divisionId))]
        const teamIds = teamRows.map((t) => t.id)

        const [divisionRows, matchRows, refRows] = await Promise.all([
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
                .select({
                    matchId: matchReferees.match_id,
                    refName: users.name
                })
                .from(matchReferees)
                .innerJoin(users, eq(matchReferees.referee_id, users.id))
                .where(eq(matchReferees.season_id, seasonId))
        ])

        const refByMatchId = new Map(
            refRows.map((row) => [row.matchId, row.refName])
        )
        const teamById = new Map(teamRows.map((t) => [t.id, t]))
        const teamsByDivision = new Map<number, typeof teamRows>()
        for (const team of teamRows) {
            const current = teamsByDivision.get(team.divisionId) || []
            current.push(team)
            teamsByDivision.set(team.divisionId, current)
        }

        const matchesByDivision = new Map<number, typeof matchRows>()
        for (const row of matchRows) {
            const current = matchesByDivision.get(row.divisionId) || []
            current.push(row)
            matchesByDivision.set(row.divisionId, current)
        }

        const divisionData: ScheduleDivision[] = divisionRows.map(
            (division) => {
                const divisionTeams = teamsByDivision.get(division.id) || []
                const divisionMatches = matchesByDivision.get(division.id) || []

                const standings = computeStandings(
                    divisionTeams,
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
                    const existing = weeksMap.get(week) || {
                        week,
                        date: match.date,
                        matches: []
                    }

                    const setScores = getSetScores(match)
                    let homeGames = 0
                    let awayGames = 0
                    for (const set of setScores) {
                        if (set.home > set.away) {
                            homeGames++
                        } else if (set.away > set.home) {
                            awayGames++
                        }
                    }

                    const hasResult =
                        setScores.length > 0 ||
                        (match.homeScore !== null && match.awayScore !== null)
                    if (setScores.length === 0 && hasResult) {
                        homeGames = match.homeScore || 0
                        awayGames = match.awayScore || 0
                    }

                    const homeWinsMatch = homeGames >= awayGames
                    const winnerName = hasResult
                        ? homeWinsMatch
                            ? homeTeam.name
                            : awayTeam.name
                        : null
                    const loserName = hasResult
                        ? homeWinsMatch
                            ? awayTeam.name
                            : homeTeam.name
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
                        .map((set) => {
                            const winnerFirst = homeWinsMatch
                                ? `${set.home}-${set.away}`
                                : `${set.away}-${set.home}`
                            return winnerFirst
                        })
                        .join(", ")

                    existing.matches.push({
                        id: match.id,
                        time: match.time,
                        court: match.court,
                        matchLabel:
                            homeTeam.number !== null && awayTeam.number !== null
                                ? `${homeTeam.number} vs ${awayTeam.number}`
                                : `${homeTeam.name} vs ${awayTeam.name}`,
                        winnerName,
                        winnerGames,
                        loserName,
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
                    standings,
                    weeks
                }
            }
        )

        return {
            status: true,
            seasonLabel,
            divisions: divisionData
        }
    } catch (error) {
        console.error("Error fetching season schedule data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasonLabel: "",
            divisions: []
        }
    }
}
