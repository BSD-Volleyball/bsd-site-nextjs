import "server-only"

import { db } from "@/database/db"
import {
    divisions,
    tournamentDivisions,
    tournamentMatches,
    tournamentRoster,
    tournamentTeams,
    tournamentWaitlist,
    users
} from "@/database/schema"
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm"
import { formatPlayerName } from "@/lib/utils"
import {
    getTournamentAvailability,
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
    tournamentCode: string
    tournamentDate: string
    tournamentType: "coed" | "reverse_coed"
    phase: TournamentPhase
    registrationOpen: boolean
    // True when every division has hit its team_count cap. When this is true
    // the dashboard card hides the "Sign Up a Team" CTA even if registration
    // is otherwise open.
    allDivisionsFull: boolean
    showSchedule: boolean
    team: null | {
        teamId: number
        teamName: string
        isCaptain: boolean
        divisionName: string | null
        roster: { userId: string; name: string; isCaptain: boolean }[]
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
    const availability = registrationOpen
        ? await getTournamentAvailability(config)
        : null
    const allDivisionsFull = availability?.allDivisionsFull ?? false

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
                captainId: tournamentTeams.captain_user_id,
                divisionId: tournamentTeams.division_id,
                preferredDivisionId: tournamentTeams.preferred_division_id
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
            // Final (admin-assigned) division wins; preferred is the fallback
            // pre-prepare, matching the Tournament Overview admin page.
            const effectiveDivisionId =
                teamRow.divisionId ?? teamRow.preferredDivisionId
            const [divRow] = await db
                .select({ name: divisions.name })
                .from(tournamentDivisions)
                .innerJoin(
                    divisions,
                    eq(divisions.id, tournamentDivisions.division_id)
                )
                .where(eq(tournamentDivisions.id, effectiveDivisionId))
                .limit(1)

            const rosterRows = await db
                .select({
                    userId: tournamentRoster.user_id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name
                })
                .from(tournamentRoster)
                .innerJoin(users, eq(users.id, tournamentRoster.user_id))
                .where(eq(tournamentRoster.team_id, teamRow.id))
                .orderBy(asc(users.last_name), asc(users.first_name))

            const roster = rosterRows
                .map((r) => ({
                    userId: r.userId,
                    name: formatPlayerName(
                        r.firstName,
                        r.lastName,
                        r.preferredName
                    ),
                    isCaptain: r.userId === teamRow.captainId
                }))
                .sort((a, b) => {
                    if (a.isCaptain && !b.isCaptain) return -1
                    if (!a.isCaptain && b.isCaptain) return 1
                    return a.name.localeCompare(b.name)
                })

            team = {
                teamId: teamRow.id,
                teamName: teamRow.name,
                isCaptain: teamRow.captainId === userId,
                divisionName: divRow?.name ?? null,
                roster,
                nextMatch,
                nextWork
            }
        }
    }

    return {
        tournamentId: config.tournamentId,
        tournamentName: config.name,
        tournamentCode: config.code,
        tournamentDate: config.tournamentDate,
        tournamentType: config.tournamentType,
        phase: config.phase,
        registrationOpen,
        allDivisionsFull,
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
