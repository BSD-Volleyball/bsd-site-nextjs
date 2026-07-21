import "server-only"

import { db } from "@/database/db"
import {
    tournamentDivisions,
    tournamentMatches,
    tournamentPlacements,
    tournaments,
    tournamentTeams
} from "@/database/schema"
import { eq } from "drizzle-orm"
import {
    matchHasFinalScore,
    usavRankTeams,
    type UsavMatch,
    type UsavTeam
} from "@/lib/usav-ranking"
import type { SetsFormat, SetsMode } from "@/lib/tournament-sets"

export interface FinalMatch extends UsavMatch {
    bracket: string
    bracket_round: number | null
}

export interface FinalStandingRow {
    teamId: number
    name: string
    place: number
}

function isBracket(m: FinalMatch): boolean {
    return m.bracket !== "pool"
}

/**
 * Rank a whole division for final placement when a tournament ends (normally or
 * early). Bracket placement is primary — teams that advanced further or are still
 * alive outrank teams eliminated earlier, and a decided final fixes 1st and 2nd
 * exactly. Ties WITHIN a bracket tier (and the entire pool-only case) are broken
 * by the USAV tie-break flow chart over all completed matches (pool + playoff).
 *
 * Pure and DB-free for unit testing.
 */
export function rankDivisionFinal(
    teams: UsavTeam[],
    matches: FinalMatch[],
    poolFormat: SetsFormat,
    playoffFormat: SetsFormat
): FinalStandingRow[] {
    // Pool matches judge completion by the pool format; bracket matches by the
    // playoff format.
    const formatFor = (m: UsavMatch): SetsFormat =>
        m.bracket && m.bracket !== "pool" ? playoffFormat : poolFormat

    const bracketMatches = matches.filter(isBracket)
    const hasLosers = bracketMatches.some((m) => m.bracket === "losers")

    // A decided grand/championship final pins 1st and 2nd exactly.
    const finalMatch = bracketMatches.find(
        (m) =>
            m.bracket === "final" &&
            matchHasFinalScore(m, playoffFormat) &&
            m.winner_team_id !== null
    )
    let championId: number | null = null
    let runnerUpId: number | null = null
    if (finalMatch) {
        championId = finalMatch.winner_team_id
        runnerUpId =
            finalMatch.home_team_id === championId
                ? finalMatch.away_team_id
                : finalMatch.home_team_id
    }

    // Teams that reached the bracket at all.
    const inBracket = new Set<number>()
    for (const m of bracketMatches) {
        if (m.home_team_id !== null) inBracket.add(m.home_team_id)
        if (m.away_team_id !== null) inBracket.add(m.away_team_id)
    }

    function bracketInfo(teamId: number): {
        eliminated: boolean
        eliminationDepth: number
        furthestRound: number
    } {
        let eliminated = false
        let eliminationDepth = 0
        let furthestRound = 0
        for (const m of bracketMatches) {
            const isHome = m.home_team_id === teamId
            const isAway = m.away_team_id === teamId
            if (!isHome && !isAway) continue
            if (m.bracket_round !== null) {
                furthestRound = Math.max(furthestRound, m.bracket_round)
            }
            if (
                !matchHasFinalScore(m, playoffFormat) ||
                m.winner_team_id === null
            )
                continue
            const lost = m.winner_team_id !== teamId
            if (!lost) continue
            // Single-elim: any bracket loss eliminates. Double-elim: only a loss
            // in the losers bracket or the grand final eliminates.
            const isEliminatingLoss = hasLosers
                ? m.bracket === "losers" || m.bracket === "final"
                : true
            if (isEliminatingLoss) {
                eliminated = true
                if (m.bracket_round !== null) {
                    eliminationDepth = Math.max(
                        eliminationDepth,
                        m.bracket_round
                    )
                }
            }
        }
        return { eliminated, eliminationDepth, furthestRound }
    }

    // Tier key (lexicographic, ascending = better):
    //   [0] champion, [1] runner-up,
    //   [2, -furthestRound] still-alive bracket teams (deeper = better),
    //   [3, -eliminationDepth] eliminated bracket teams (later = better),
    //   [4] never reached the bracket.
    function tierKey(teamId: number): [number, number] {
        if (championId !== null && teamId === championId) return [0, 0]
        if (runnerUpId !== null && teamId === runnerUpId) return [1, 0]
        if (inBracket.has(teamId)) {
            const info = bracketInfo(teamId)
            return info.eliminated
                ? [3, -info.eliminationDepth]
                : [2, -info.furthestRound]
        }
        return [4, 0]
    }

    const withKey = teams.map((team) => ({ team, key: tierKey(team.id) }))
    withKey.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1])

    const result: FinalStandingRow[] = []
    let i = 0
    while (i < withKey.length) {
        let j = i + 1
        while (
            j < withKey.length &&
            withKey[j].key[0] === withKey[i].key[0] &&
            withKey[j].key[1] === withKey[i].key[1]
        ) {
            j++
        }
        // Break ties within a tier by full-record USAV ranking.
        const tierTeams = withKey.slice(i, j).map((x) => x.team)
        const ranked = usavRankTeams(tierTeams, matches, formatFor)
        for (const r of ranked) {
            result.push({
                teamId: r.teamId,
                name: r.name,
                place: result.length + 1
            })
        }
        i = j
    }

    return result
}

/**
 * Compute final placements for every division of a tournament from current data.
 */
export async function computeTournamentPlacements(
    tournamentId: number
): Promise<Map<number, FinalStandingRow[]>> {
    const divisions = await db
        .select({ id: tournamentDivisions.id })
        .from(tournamentDivisions)
        .where(eq(tournamentDivisions.tournament_id, tournamentId))

    const [t] = await db
        .select({
            poolMode: tournaments.pool_sets_mode,
            poolCount: tournaments.pool_sets_count,
            playoffMode: tournaments.playoff_sets_mode,
            playoffCount: tournaments.playoff_sets_count
        })
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId))
        .limit(1)
    const poolFormat: SetsFormat = t
        ? { mode: t.poolMode as SetsMode, count: t.poolCount }
        : { mode: "exact", count: 2 }
    const playoffFormat: SetsFormat = t
        ? { mode: t.playoffMode as SetsMode, count: t.playoffCount }
        : { mode: "best_of", count: 3 }

    const byDivision = new Map<number, FinalStandingRow[]>()
    for (const division of divisions) {
        const teams = await db
            .select({ id: tournamentTeams.id, name: tournamentTeams.name })
            .from(tournamentTeams)
            .where(eq(tournamentTeams.division_id, division.id))

        if (teams.length === 0) continue

        const matches = await db
            .select()
            .from(tournamentMatches)
            .where(eq(tournamentMatches.division_id, division.id))

        byDivision.set(
            division.id,
            rankDivisionFinal(
                teams,
                matches as FinalMatch[],
                poolFormat,
                playoffFormat
            )
        )
    }
    return byDivision
}

/**
 * Compute and persist final placements. Idempotent: replaces any existing
 * placements for the tournament. Returns the number of divisions ranked.
 */
export async function finalizeTournamentResults(
    tournamentId: number
): Promise<{ divisionsPlaced: number; teamsPlaced: number }> {
    const byDivision = await computeTournamentPlacements(tournamentId)

    let teamsPlaced = 0
    await db.transaction(async (tx) => {
        await tx
            .delete(tournamentPlacements)
            .where(eq(tournamentPlacements.tournament_id, tournamentId))

        for (const [divisionId, rows] of byDivision) {
            if (rows.length === 0) continue
            await tx.insert(tournamentPlacements).values(
                rows.map((r) => ({
                    tournament_id: tournamentId,
                    division_id: divisionId,
                    team_id: r.teamId,
                    place: r.place
                }))
            )
            teamsPlaced += rows.length
        }
    })

    return { divisionsPlaced: byDivision.size, teamsPlaced }
}
