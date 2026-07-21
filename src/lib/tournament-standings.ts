import "server-only"

import { db } from "@/database/db"
import {
    tournamentMatches,
    tournamentPools,
    tournamentPoolTeams,
    tournaments,
    tournamentTeams
} from "@/database/schema"
import { asc, eq } from "drizzle-orm"
import { usavRankTeams, type UsavMatch } from "@/lib/usav-ranking"
import type { SetsFormat, SetsMode } from "@/lib/tournament-sets"

export interface PoolStandingRow {
    teamId: number
    teamName: string
    wins: number
    losses: number
    setsWon: number
    setsLost: number
    setPct: number
    pointsFor: number
    pointsAgainst: number
    pointDifferential: number
    pointPct: number
}

/**
 * Pool standings ordered per the USA Volleyball tie-break flow chart
 * (match record → head-to-head → set % → point %). See {@link usavRankTeams}.
 */
export async function getPoolStandings(
    poolId: number
): Promise<PoolStandingRow[]> {
    const teams = await db
        .select({
            id: tournamentPoolTeams.team_id,
            name: tournamentTeams.name
        })
        .from(tournamentPoolTeams)
        .innerJoin(
            tournamentTeams,
            eq(tournamentTeams.id, tournamentPoolTeams.team_id)
        )
        .where(eq(tournamentPoolTeams.pool_id, poolId))
        .orderBy(asc(tournamentTeams.name))

    const matches = await db
        .select()
        .from(tournamentMatches)
        .where(eq(tournamentMatches.pool_id, poolId))

    // Resolve the tournament's pool-play sets format so completion is judged the
    // same way scores are entered.
    const [fmt] = await db
        .select({
            mode: tournaments.pool_sets_mode,
            count: tournaments.pool_sets_count
        })
        .from(tournamentPools)
        .innerJoin(
            tournaments,
            eq(tournaments.id, tournamentPools.tournament_id)
        )
        .where(eq(tournamentPools.id, poolId))
        .limit(1)
    const poolFormat: SetsFormat = fmt
        ? { mode: fmt.mode as SetsMode, count: fmt.count }
        : { mode: "exact", count: 2 }

    const ranked = usavRankTeams(teams, matches as UsavMatch[], poolFormat)

    return ranked.map((r) => ({
        teamId: r.teamId,
        teamName: r.name,
        wins: r.matchWins,
        losses: r.matchLosses,
        setsWon: r.setsWon,
        setsLost: r.setsLost,
        setPct: r.setPct,
        pointsFor: r.pointsFor,
        pointsAgainst: r.pointsAgainst,
        pointDifferential: r.pointsFor - r.pointsAgainst,
        pointPct: r.pointPct
    }))
}
