"use server"

import { db } from "@/database/db"
import {
    tournamentMatches,
    tournamentPools,
    tournamentRoster,
    tournamentTeams
} from "@/database/schema"
import { asc, eq } from "drizzle-orm"
import {
    fail,
    ok,
    requireSession,
    withAction,
    type ActionResult
} from "@/lib/action-helpers"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { getTournamentConfig } from "@/lib/tournament-config"

export interface ScheduleTeam {
    id: number
    name: string
}

export interface ScheduleMatch {
    id: number
    court: number | null
    startTime: string | null
    home: ScheduleTeam | null
    away: ScheduleTeam | null
    workTeamName: string | null
    sets: { home: (number | null)[]; away: (number | null)[] }
    winnerTeamId: number | null
    played: boolean
}

export interface SchedulePool {
    id: number
    name: string
    matches: ScheduleMatch[]
}

export interface ScheduleBracketGroup {
    // 'winners' | 'losers' | 'final'
    bracket: string
    round: number
    matches: ScheduleMatch[]
}

export interface ScheduleDivision {
    id: number
    name: string
    pools: SchedulePool[]
    bracketGroups: ScheduleBracketGroup[]
}

export interface TournamentScheduleView {
    tournamentName: string
    eliminationFormat: "single" | "double"
    myTeamId: number | null
    divisions: ScheduleDivision[]
    hasPoolMatches: boolean
    hasBracketMatches: boolean
}

const BRACKET_ORDER: Record<string, number> = {
    winners: 0,
    losers: 1,
    final: 2
}

/**
 * Read-only schedule for the active tournament: round-robin pools plus the
 * playoff bracket. Available to tournament participants and admins/directors.
 * Returns null when there is no active tournament.
 */
export const getTournamentScheduleView = withAction(
    async (): Promise<ActionResult<TournamentScheduleView | null>> => {
        const session = await requireSession()
        const config = await getTournamentConfig()
        if (!config) return ok(null)

        // Resolve the viewer's team (used for authorization and highlighting).
        const [rosterRow] = await db
            .select({ teamId: tournamentRoster.team_id })
            .from(tournamentRoster)
            .where(eq(tournamentRoster.user_id, session.user.id))
            .limit(1)
        const myTeamId = rosterRow?.teamId ?? null

        const isAdmin = await isAdminOrDirectorBySession()
        if (!isAdmin && myTeamId === null) {
            return fail("You are not part of this tournament.")
        }

        const [matches, teams, pools] = await Promise.all([
            db
                .select()
                .from(tournamentMatches)
                .where(
                    eq(tournamentMatches.tournament_id, config.tournamentId)
                ),
            db
                .select({ id: tournamentTeams.id, name: tournamentTeams.name })
                .from(tournamentTeams)
                .where(eq(tournamentTeams.tournament_id, config.tournamentId)),
            db
                .select()
                .from(tournamentPools)
                .where(eq(tournamentPools.tournament_id, config.tournamentId))
                .orderBy(asc(tournamentPools.name))
        ])

        const teamName = new Map(teams.map((t) => [t.id, t.name]))

        const toTeam = (id: number | null): ScheduleTeam | null =>
            id !== null ? { id, name: teamName.get(id) ?? `Team ${id}` } : null

        const toMatch = (m: (typeof matches)[number]): ScheduleMatch => {
            const sets = {
                home: [m.home_set1_score, m.home_set2_score, m.home_set3_score],
                away: [m.away_set1_score, m.away_set2_score, m.away_set3_score]
            }
            const played =
                m.winner_team_id !== null ||
                sets.home.some((s) => s !== null) ||
                sets.away.some((s) => s !== null)
            return {
                id: m.id,
                court: m.court,
                startTime: m.start_time,
                home: toTeam(m.home_team_id),
                away: toTeam(m.away_team_id),
                workTeamName:
                    m.work_team_id !== null
                        ? (teamName.get(m.work_team_id) ?? null)
                        : null,
                sets,
                winnerTeamId: m.winner_team_id,
                played
            }
        }

        // Match play order: earliest start time first, then court. Null times
        // (unscheduled) sort last so a partially-scheduled pool still reads.
        const byStartThenCourt = (a: ScheduleMatch, b: ScheduleMatch) => {
            const at = a.startTime ?? "99:99:99"
            const bt = b.startTime ?? "99:99:99"
            if (at !== bt) return at < bt ? -1 : 1
            return (
                (a.court ?? Number.MAX_SAFE_INTEGER) -
                (b.court ?? Number.MAX_SAFE_INTEGER)
            )
        }

        const poolMap = new Map(pools.map((p) => [p.id, p]))
        let hasPoolMatches = false
        let hasBracketMatches = false

        const divisions: ScheduleDivision[] = config.divisions
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((div) => {
                const divMatches = matches.filter(
                    (m) => m.division_id === div.id
                )

                // Round-robin pools
                const poolBuckets = new Map<number, ScheduleMatch[]>()
                for (const m of divMatches) {
                    if (m.bracket !== "pool" || m.pool_id === null) continue
                    const arr = poolBuckets.get(m.pool_id) ?? []
                    arr.push(toMatch(m))
                    poolBuckets.set(m.pool_id, arr)
                }
                const divPools: SchedulePool[] = [...poolBuckets.entries()]
                    .map(([poolId, ms]) => ({
                        id: poolId,
                        name: poolMap.get(poolId)?.name ?? `Pool ${poolId}`,
                        matches: ms.sort(byStartThenCourt)
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name))
                if (divPools.length > 0) hasPoolMatches = true

                // Playoff bracket, grouped by bracket then round
                const bracketBuckets = new Map<string, ScheduleMatch[]>()
                for (const m of divMatches) {
                    if (m.bracket === "pool") continue
                    const key = `${m.bracket}::${m.bracket_round ?? 0}`
                    const arr = bracketBuckets.get(key) ?? []
                    arr.push(toMatch(m))
                    bracketBuckets.set(key, arr)
                }
                const divBracketGroups: ScheduleBracketGroup[] = [
                    ...bracketBuckets.entries()
                ]
                    .map(([key, ms]) => {
                        const [bracket, round] = key.split("::")
                        return {
                            bracket,
                            round: Number(round),
                            matches: ms.sort(byStartThenCourt)
                        }
                    })
                    .sort(
                        (a, b) =>
                            (BRACKET_ORDER[a.bracket] ?? 9) -
                                (BRACKET_ORDER[b.bracket] ?? 9) ||
                            a.round - b.round
                    )
                if (divBracketGroups.length > 0) hasBracketMatches = true

                return {
                    id: div.id,
                    name: div.divisionName,
                    pools: divPools,
                    bracketGroups: divBracketGroups
                }
            })
            .filter((d) => d.pools.length > 0 || d.bracketGroups.length > 0)

        return ok({
            tournamentName: config.name,
            eliminationFormat: config.eliminationFormat,
            myTeamId,
            divisions,
            hasPoolMatches,
            hasBracketMatches
        })
    }
)
