"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    divisions,
    teams,
    matchs,
    playoffMatchesMeta,
    individual_divisions
} from "@/database/schema"
import { eq, asc } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"
import { getSeasonConfig } from "@/lib/site-config"
import {
    SIX_TEAM_ROUNDS,
    SIX_TEAM_ROTATIONS,
    SIX_TEAM_TIMES,
    FOUR_TEAM_WEEKS,
    FOUR_TEAM_TIMES,
    SIX_TEAM_PLAYOFF,
    FOUR_TEAM_PLAYOFF,
    REGULAR_SEASON_WEEKS
} from "./schedule-constants"
import type { PlayoffMatchTemplate } from "./schedule-constants"

export interface DivisionWithTeams {
    divisionId: number
    divisionName: string
    level: number
    teamCount: number
    teams: { id: number; number: number | null; name: string }[]
}

export interface SeasonDates {
    seasonDates: string[]
    seasonTimes: string[]
    playoffDates: string[]
}

export interface SchedulePreviewMatch {
    week: number
    date: string
    time: string
    court: number
    homeTeamNumber: number
    awayTeamNumber: number
    homeTeamName: string
    awayTeamName: string
}

export interface PlayoffPreviewMatch {
    matchNum: number
    week: number
    date: string
    time: string
    court: number
    homeSource: string
    awaySource: string
    bracket: string
    workTeamSource: string | null
}

export interface CreateScheduleData {
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    divisions: DivisionWithTeams[]
    seasonDates: SeasonDates
    regularSeasonPreview: Map<number, SchedulePreviewMatch[]> | null
    playoffPreview: Map<number, PlayoffPreviewMatch[]> | null
}

async function checkAdminAccess(): Promise<boolean> {
    return isAdminOrDirectorBySession()
}

export async function getCreateScheduleData(): Promise<{
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    phase: string
    divisions: DivisionWithTeams[]
    seasonDates: string[]
    seasonTimes: string[]
    playoffDates: string[]
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            seasonId: 0,
            seasonLabel: "",
            phase: "",
            divisions: [],
            seasonDates: [],
            seasonTimes: [],
            playoffDates: []
        }
    }

    try {
        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return {
                status: false,
                message: "No active season found.",
                seasonId: 0,
                seasonLabel: "",
                phase: "",
                divisions: [],
                seasonDates: [],
                seasonTimes: [],
                playoffDates: []
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        // Get divisions for this season via individual_divisions
        const indivDivs = await db
            .select({
                divisionId: individual_divisions.division,
                teams: individual_divisions.teams,
                divName: divisions.name,
                divLevel: divisions.level
            })
            .from(individual_divisions)
            .innerJoin(
                divisions,
                eq(individual_divisions.division, divisions.id)
            )
            .where(eq(individual_divisions.season, config.seasonId))
            .orderBy(asc(divisions.level))

        // Get teams for this season grouped by division
        const allTeams = await db
            .select({
                id: teams.id,
                division: teams.division,
                number: teams.number,
                name: teams.name
            })
            .from(teams)
            .where(eq(teams.season, config.seasonId))
            .orderBy(asc(teams.number))

        const teamsByDivision = new Map<
            number,
            { id: number; number: number | null; name: string }[]
        >()
        for (const t of allTeams) {
            if (!teamsByDivision.has(t.division)) {
                teamsByDivision.set(t.division, [])
            }
            teamsByDivision.get(t.division)!.push({
                id: t.id,
                number: t.number,
                name: t.name
            })
        }

        const divisionsData: DivisionWithTeams[] = indivDivs.map((d) => ({
            divisionId: d.divisionId,
            divisionName: d.divName,
            level: d.divLevel,
            teamCount: d.teams,
            teams: teamsByDivision.get(d.divisionId) || []
        }))

        const seasonDates = [
            config.season1Date,
            config.season2Date,
            config.season3Date,
            config.season4Date,
            config.season5Date,
            config.season6Date
        ]

        const seasonTimes = [
            config.seasonSession1Time,
            config.seasonSession2Time,
            config.seasonSession3Time
        ]

        const playoffDates = [
            config.playoff1Date,
            config.playoff2Date,
            config.playoff3Date
        ]

        return {
            status: true,
            seasonId: config.seasonId,
            seasonLabel,
            phase: config.phase,
            divisions: divisionsData,
            seasonDates,
            seasonTimes,
            playoffDates
        }
    } catch (error) {
        console.error("Error fetching create schedule data:", error)
        return {
            status: false,
            message: "Something went wrong loading schedule data.",
            seasonId: 0,
            seasonLabel: "",
            phase: "",
            divisions: [],
            seasonDates: [],
            seasonTimes: [],
            playoffDates: []
        }
    }
}

function buildRegularSeasonMatches(
    divisionIndex: number,
    division: DivisionWithTeams,
    seasonDates: string[],
    seasonTimes: string[]
): {
    week: number
    date: string
    time: string
    court: number
    homeTeamId: number
    awayTeamId: number
}[] {
    const court = division.level
    const teamMap = new Map<number, number>()
    for (const t of division.teams) {
        if (t.number !== null) {
            teamMap.set(t.number, t.id)
        }
    }

    const matches: {
        week: number
        date: string
        time: string
        court: number
        homeTeamId: number
        awayTeamId: number
    }[] = []

    if (division.teamCount === 4) {
        for (let week = 0; week < REGULAR_SEASON_WEEKS; week++) {
            const weekMatchups = FOUR_TEAM_WEEKS[week]
            for (let m = 0; m < weekMatchups.length; m++) {
                const [home, away] = weekMatchups[m]
                const homeId = teamMap.get(home)
                const awayId = teamMap.get(away)
                if (homeId && awayId) {
                    matches.push({
                        week: week + 1,
                        date: seasonDates[week] || "",
                        time: FOUR_TEAM_TIMES[m] || seasonTimes[m + 1] || "",
                        court,
                        homeTeamId: homeId,
                        awayTeamId: awayId
                    })
                }
            }
        }
    } else {
        // 6-team division
        const rotation =
            SIX_TEAM_ROTATIONS[divisionIndex] || SIX_TEAM_ROTATIONS[0]
        for (let week = 0; week < REGULAR_SEASON_WEEKS; week++) {
            const roundIdx = rotation[week]
            const round = SIX_TEAM_ROUNDS[roundIdx]
            for (let m = 0; m < round.length; m++) {
                const [home, away] = round[m]
                const homeId = teamMap.get(home)
                const awayId = teamMap.get(away)
                if (homeId && awayId) {
                    matches.push({
                        week: week + 1,
                        date: seasonDates[week] || "",
                        time: SIX_TEAM_TIMES[m] || seasonTimes[m] || "",
                        court,
                        homeTeamId: homeId,
                        awayTeamId: awayId
                    })
                }
            }
        }
    }

    return matches
}

export async function writeRegularSeasonSchedule(
    seasonId: number
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to perform this action."
        }
    }

    if (!seasonId || seasonId <= 0) {
        return { status: false, message: "Invalid season ID." }
    }

    try {
        const data = await getCreateScheduleData()
        if (!data.status) {
            return {
                status: false,
                message: data.message || "Failed to load schedule data."
            }
        }

        // Check that teams exist
        const totalTeams = data.divisions.reduce(
            (sum, d) => sum + d.teams.length,
            0
        )
        if (totalTeams === 0) {
            return {
                status: false,
                message:
                    "No teams found for this season. Create teams before generating the schedule."
            }
        }

        // Check for incomplete team assignments
        for (const div of data.divisions) {
            if (div.teams.length !== div.teamCount) {
                return {
                    status: false,
                    message: `${div.divisionName} expects ${div.teamCount} teams but has ${div.teams.length}. Please create all teams first.`
                }
            }
        }

        const allMatches: {
            season: number
            division: number
            week: number
            date: string
            time: string
            court: number
            home_team: number
            away_team: number
            playoff: boolean
        }[] = []

        for (let i = 0; i < data.divisions.length; i++) {
            const div = data.divisions[i]
            const divMatches = buildRegularSeasonMatches(
                i,
                div,
                data.seasonDates,
                data.seasonTimes
            )
            for (const m of divMatches) {
                allMatches.push({
                    season: seasonId,
                    division: div.divisionId,
                    week: m.week,
                    date: m.date,
                    time: m.time,
                    court: m.court,
                    home_team: m.homeTeamId,
                    away_team: m.awayTeamId,
                    playoff: false
                })
            }
        }

        if (allMatches.length === 0) {
            return {
                status: false,
                message: "No matches generated. Check team data."
            }
        }

        await db.insert(matchs).values(allMatches)

        const session = await auth.api.getSession({ headers: await headers() })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "schedule",
                summary: `Created ${allMatches.length} regular season matches for season ${seasonId}`
            })
        }

        return {
            status: true,
            message: `Successfully created ${allMatches.length} regular season matches across ${data.divisions.length} divisions!`
        }
    } catch (error) {
        console.error("Error writing regular season schedule:", error)
        return {
            status: false,
            message: "Something went wrong while creating the schedule."
        }
    }
}

function getSecondCourt(primaryCourt: number): number {
    // In historical data, when simultaneous playoff matches happen,
    // the second court is typically court 1 for most divisions.
    // If the primary court IS court 1, use court 2 as fallback.
    return primaryCourt === 1 ? 2 : 1
}

export async function writePlayoffSchedule(
    seasonId: number
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to perform this action."
        }
    }

    if (!seasonId || seasonId <= 0) {
        return { status: false, message: "Invalid season ID." }
    }

    try {
        const data = await getCreateScheduleData()
        if (!data.status) {
            return {
                status: false,
                message: data.message || "Failed to load schedule data."
            }
        }

        const totalTeams = data.divisions.reduce(
            (sum, d) => sum + d.teams.length,
            0
        )
        if (totalTeams === 0) {
            return {
                status: false,
                message:
                    "No teams found. Create teams before generating the playoff schedule."
            }
        }

        let totalMatchesCreated = 0

        for (const div of data.divisions) {
            const template: PlayoffMatchTemplate[] =
                div.teamCount === 4 ? FOUR_TEAM_PLAYOFF : SIX_TEAM_PLAYOFF
            const court = div.level

            // Insert playoff match rows (no team IDs yet - teams determined by seeds)
            const insertedMatches: {
                matchNum: number
                matchId: number
            }[] = []

            for (const pm of template) {
                const date =
                    pm.week <= data.playoffDates.length
                        ? data.playoffDates[pm.week - 1]
                        : ""
                const matchCourt = pm.useSecondCourt
                    ? getSecondCourt(court)
                    : court

                const [inserted] = await db
                    .insert(matchs)
                    .values({
                        season: seasonId,
                        division: div.divisionId,
                        week: pm.week,
                        date,
                        time: pm.time,
                        court: matchCourt,
                        playoff: true
                    })
                    .returning({ id: matchs.id })

                insertedMatches.push({
                    matchNum: pm.matchNum,
                    matchId: inserted.id
                })
                totalMatchesCreated++
            }

            // Build matchNum → matchId lookup
            const matchIdMap = new Map<number, number>()
            for (const im of insertedMatches) {
                matchIdMap.set(im.matchNum, im.matchId)
            }

            // Insert playoff_matches_meta rows
            for (const pm of template) {
                const matchId = matchIdMap.get(pm.matchNum)
                if (!matchId) continue

                await db.insert(playoffMatchesMeta).values({
                    season: seasonId,
                    division: div.divisionId,
                    week: pm.week,
                    match_num: pm.matchNum,
                    match_id: matchId,
                    bracket: pm.bracket,
                    home_source: pm.homeSeed,
                    away_source: pm.awaySeed,
                    next_match_num: pm.nextMatchNum,
                    next_loser_match_num: pm.nextLoserMatchNum
                })
            }
        }

        const session = await auth.api.getSession({ headers: await headers() })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "playoff_schedule",
                summary: `Created ${totalMatchesCreated} playoff matches for season ${seasonId}`
            })
        }

        return {
            status: true,
            message: `Successfully created ${totalMatchesCreated} playoff matches across ${data.divisions.length} divisions!`
        }
    } catch (error) {
        console.error("Error writing playoff schedule:", error)
        return {
            status: false,
            message: "Something went wrong while creating the playoff schedule."
        }
    }
}
