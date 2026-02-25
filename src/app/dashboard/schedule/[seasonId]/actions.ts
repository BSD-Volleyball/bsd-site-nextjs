"use server"

import { db } from "@/database/db"
import { divisions, matchs, seasons, teams } from "@/database/schema"
import { and, eq, inArray } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

interface StandingTeam {
    id: number
    number: number | null
    name: string
    wins: number
    losses: number
    pointDiff: number
    pointsFor: number
}

interface WeekMatchLine {
    id: number
    time: string | null
    court: number | null
    matchLabel: string
    winnerName: string
    winnerGames: number
    loserName: string
    loserGames: number
    scoresDisplay: string
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

interface HeadToHeadStats {
    aWins: number
    bWins: number
    aPoints: number
    bPoints: number
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

function getSetScores(row: {
    home_set1_score: number | null
    away_set1_score: number | null
    home_set2_score: number | null
    away_set2_score: number | null
    home_set3_score: number | null
    away_set3_score: number | null
}): Array<{ home: number; away: number }> {
    const sets: Array<{ home: number; away: number }> = []
    if (row.home_set1_score !== null && row.away_set1_score !== null) {
        sets.push({ home: row.home_set1_score, away: row.away_set1_score })
    }
    if (row.home_set2_score !== null && row.away_set2_score !== null) {
        sets.push({ home: row.home_set2_score, away: row.away_set2_score })
    }
    if (row.home_set3_score !== null && row.away_set3_score !== null) {
        sets.push({ home: row.home_set3_score, away: row.away_set3_score })
    }
    return sets
}

function getHeadToHeadStats(
    divisionMatches: Array<{
        homeTeamId: number | null
        awayTeamId: number | null
        homeScore: number | null
        awayScore: number | null
        home_set1_score: number | null
        away_set1_score: number | null
        home_set2_score: number | null
        away_set2_score: number | null
        home_set3_score: number | null
        away_set3_score: number | null
    }>,
    teamAId: number,
    teamBId: number
): HeadToHeadStats {
    let aWins = 0
    let bWins = 0
    let aPoints = 0
    let bPoints = 0

    for (const match of divisionMatches) {
        const involvesBothTeams =
            (match.homeTeamId === teamAId && match.awayTeamId === teamBId) ||
            (match.homeTeamId === teamBId && match.awayTeamId === teamAId)

        if (!involvesBothTeams) continue

        const setScores = getSetScores(match)
        const aIsHome = match.homeTeamId === teamAId

        if (setScores.length > 0) {
            for (const set of setScores) {
                const aScore = aIsHome ? set.home : set.away
                const bScore = aIsHome ? set.away : set.home

                aPoints += aScore
                bPoints += bScore

                if (aScore > bScore) {
                    aWins++
                } else if (bScore > aScore) {
                    bWins++
                }
            }
        } else if (match.homeScore !== null && match.awayScore !== null) {
            const aGameWins = aIsHome ? match.homeScore : match.awayScore
            const bGameWins = aIsHome ? match.awayScore : match.homeScore
            aWins += aGameWins
            bWins += bGameWins
        }
    }

    return {
        aWins,
        bWins,
        aPoints,
        bPoints
    }
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

        const [divisionRows, matchRows] = await Promise.all([
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
                    id: matchs.id,
                    divisionId: matchs.division,
                    week: matchs.week,
                    date: matchs.date,
                    time: matchs.time,
                    court: matchs.court,
                    homeTeamId: matchs.home_team,
                    awayTeamId: matchs.away_team,
                    homeScore: matchs.home_score,
                    awayScore: matchs.away_score,
                    home_set1_score: matchs.home_set1_score,
                    away_set1_score: matchs.away_set1_score,
                    home_set2_score: matchs.home_set2_score,
                    away_set2_score: matchs.away_set2_score,
                    home_set3_score: matchs.home_set3_score,
                    away_set3_score: matchs.away_set3_score
                })
                .from(matchs)
                .where(
                    and(
                        eq(matchs.season, seasonId),
                        inArray(matchs.division, divisionIds),
                        eq(matchs.playoff, false),
                        inArray(matchs.home_team, teamIds),
                        inArray(matchs.away_team, teamIds)
                    )
                )
        ])

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

                const standingsByTeamId = new Map<number, StandingTeam>(
                    divisionTeams.map((t) => [
                        t.id,
                        {
                            id: t.id,
                            number: t.number,
                            name: t.name,
                            wins: 0,
                            losses: 0,
                            pointDiff: 0,
                            pointsFor: 0
                        }
                    ])
                )

                for (const match of divisionMatches) {
                    if (match.homeTeamId === null || match.awayTeamId === null)
                        continue
                    const homeStanding = standingsByTeamId.get(match.homeTeamId)
                    const awayStanding = standingsByTeamId.get(match.awayTeamId)
                    if (!homeStanding || !awayStanding) continue

                    const setScores = getSetScores(match)

                    if (setScores.length > 0) {
                        for (const set of setScores) {
                            homeStanding.pointsFor += set.home
                            awayStanding.pointsFor += set.away
                            homeStanding.pointDiff += set.home - set.away
                            awayStanding.pointDiff += set.away - set.home

                            if (set.home > set.away) {
                                homeStanding.wins++
                                awayStanding.losses++
                            } else if (set.away > set.home) {
                                awayStanding.wins++
                                homeStanding.losses++
                            }
                        }
                    } else if (
                        match.homeScore !== null &&
                        match.awayScore !== null
                    ) {
                        homeStanding.wins += match.homeScore
                        homeStanding.losses += match.awayScore
                        awayStanding.wins += match.awayScore
                        awayStanding.losses += match.homeScore
                    }
                }

                const standings = [...standingsByTeamId.values()].sort(
                    (a, b) => {
                        // Primary sort: total game wins
                        if (b.wins !== a.wins) return b.wins - a.wins

                        // Tie-breaker #1: head-to-head game wins
                        const h2h = getHeadToHeadStats(
                            divisionMatches,
                            a.id,
                            b.id
                        )
                        if (h2h.aWins !== h2h.bWins) {
                            return h2h.bWins - h2h.aWins
                        }

                        // Tie-breaker #2: head-to-head total points
                        if (h2h.aPoints !== h2h.bPoints) {
                            return h2h.bPoints - h2h.aPoints
                        }

                        // Tie-breaker #3: overall point differential
                        if (b.pointDiff !== a.pointDiff) {
                            return b.pointDiff - a.pointDiff
                        }

                        // Tie-breaker #4: overall total points scored
                        if (b.pointsFor !== a.pointsFor) {
                            return b.pointsFor - a.pointsFor
                        }

                        // Deterministic fallback
                        if ((a.number ?? 999) !== (b.number ?? 999)) {
                            return (a.number ?? 999) - (b.number ?? 999)
                        }
                        return a.name.localeCompare(b.name)
                    }
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

                    if (setScores.length === 0) {
                        homeGames = match.homeScore || 0
                        awayGames = match.awayScore || 0
                    }

                    const homeWinsMatch = homeGames >= awayGames
                    const winnerName = homeWinsMatch
                        ? homeTeam.name
                        : awayTeam.name
                    const loserName = homeWinsMatch
                        ? awayTeam.name
                        : homeTeam.name
                    const winnerGames = homeWinsMatch ? homeGames : awayGames
                    const loserGames = homeWinsMatch ? awayGames : homeGames

                    const scoresDisplay = setScores
                        .map((set) => {
                            const winnerFirst = homeWinsMatch
                                ? `${set.home}-${set.away}`
                                : `${set.away}-${set.home}`
                            return winnerFirst
                        })
                        .join("  ")

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
                        scoresDisplay
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
