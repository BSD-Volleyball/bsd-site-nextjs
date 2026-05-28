import "server-only"

import { db } from "@/database/db"
import {
    tournamentMatches,
    tournamentRoster,
    tournamentTeams,
    tournamentWaitlist
} from "@/database/schema"
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm"
import {
    getTournamentConfig,
    isRegistrationClosed
} from "@/lib/tournament-config"
import type { TournamentPhase } from "@/lib/tournament-phases"

export interface NextMatchInfo {
    matchId: number
    bracket: string
    court: number | null
    startTime: string | null
    opponentName: string
}

export interface NextWorkInfo {
    matchId: number
    bracket: string
    court: number | null
    startTime: string | null
    homeName: string
    awayName: string
}

export interface TournamentDashboardCardData {
    tournamentId: number
    tournamentName: string
    tournamentDate: string
    phase: TournamentPhase
    registrationOpen: boolean
    showSchedule: boolean
    team: null | {
        teamId: number
        teamName: string
        isCaptain: boolean
        nextMatch: NextMatchInfo | null
        nextWork: NextWorkInfo | null
    }
    onWaitlist: boolean
}

/**
 * Aggregates everything the dashboard tournament card needs in a single
 * server call. Returns null when there's no active tournament.
 */
export async function getTournamentDashboardCard(
    userId: string
): Promise<TournamentDashboardCardData | null> {
    const config = await getTournamentConfig()
    if (!config) return null

    const showSchedule =
        config.phase === "pool_play" || config.phase === "playoffs"
    const registrationOpen =
        config.phase === "registration_open" && !isRegistrationClosed(config)

    // Waitlist row check — counts as "on waitlist" only when not yet placed.
    const [waitlistRow] = await db
        .select({ placedTeamId: tournamentWaitlist.placed_team_id })
        .from(tournamentWaitlist)
        .where(
            and(
                eq(tournamentWaitlist.tournament_id, config.tournamentId),
                eq(tournamentWaitlist.user_id, userId)
            )
        )
        .limit(1)
    const onWaitlist = !!waitlistRow && waitlistRow.placedTeamId === null

    // Roster membership check.
    const [rosterRow] = await db
        .select({ teamId: tournamentRoster.team_id })
        .from(tournamentRoster)
        .where(
            and(
                eq(tournamentRoster.tournament_id, config.tournamentId),
                eq(tournamentRoster.user_id, userId)
            )
        )
        .limit(1)

    let team: TournamentDashboardCardData["team"] = null
    if (rosterRow) {
        const [teamRow] = await db
            .select({
                id: tournamentTeams.id,
                name: tournamentTeams.name,
                captainId: tournamentTeams.captain_user_id
            })
            .from(tournamentTeams)
            .where(eq(tournamentTeams.id, rosterRow.teamId))
            .limit(1)
        if (teamRow) {
            const nextMatch = showSchedule
                ? await loadNextMatch(config.tournamentId, teamRow.id)
                : null
            const nextWork = showSchedule
                ? await loadNextWork(config.tournamentId, teamRow.id)
                : null
            team = {
                teamId: teamRow.id,
                teamName: teamRow.name,
                isCaptain: teamRow.captainId === userId,
                nextMatch,
                nextWork
            }
        }
    }

    return {
        tournamentId: config.tournamentId,
        tournamentName: config.name,
        tournamentDate: config.tournamentDate,
        phase: config.phase,
        registrationOpen,
        showSchedule,
        team,
        onWaitlist
    }
}

async function loadNextMatch(
    tournamentId: number,
    teamId: number
): Promise<NextMatchInfo | null> {
    const [m] = await db
        .select()
        .from(tournamentMatches)
        .where(
            and(
                eq(tournamentMatches.tournament_id, tournamentId),
                isNull(tournamentMatches.winner_team_id),
                or(
                    eq(tournamentMatches.home_team_id, teamId),
                    eq(tournamentMatches.away_team_id, teamId)
                )
            )
        )
        .orderBy(asc(tournamentMatches.start_time), asc(tournamentMatches.id))
        .limit(1)
    if (!m) return null

    const opponentId =
        m.home_team_id === teamId ? m.away_team_id : m.home_team_id
    let opponentName = "TBD"
    if (opponentId !== null) {
        const [opp] = await db
            .select({ name: tournamentTeams.name })
            .from(tournamentTeams)
            .where(eq(tournamentTeams.id, opponentId))
            .limit(1)
        opponentName = opp?.name ?? "TBD"
    }
    return {
        matchId: m.id,
        bracket: m.bracket,
        court: m.court,
        startTime: m.start_time,
        opponentName
    }
}

async function loadNextWork(
    tournamentId: number,
    teamId: number
): Promise<NextWorkInfo | null> {
    const [w] = await db
        .select()
        .from(tournamentMatches)
        .where(
            and(
                eq(tournamentMatches.tournament_id, tournamentId),
                isNull(tournamentMatches.winner_team_id),
                eq(tournamentMatches.work_team_id, teamId)
            )
        )
        .orderBy(asc(tournamentMatches.start_time), asc(tournamentMatches.id))
        .limit(1)
    if (!w) return null

    const ids = [w.home_team_id, w.away_team_id].filter(
        (x): x is number => x !== null
    )
    const teamMap = new Map<number, string>()
    if (ids.length > 0) {
        const rows = await db
            .select({ id: tournamentTeams.id, name: tournamentTeams.name })
            .from(tournamentTeams)
            .where(inArray(tournamentTeams.id, ids))
        for (const r of rows) teamMap.set(r.id, r.name)
    }
    return {
        matchId: w.id,
        bracket: w.bracket,
        court: w.court,
        startTime: w.start_time,
        homeName:
            w.home_team_id !== null
                ? (teamMap.get(w.home_team_id) ?? "TBD")
                : "TBD",
        awayName:
            w.away_team_id !== null
                ? (teamMap.get(w.away_team_id) ?? "TBD")
                : "TBD"
    }
}
