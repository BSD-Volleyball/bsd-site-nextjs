"use server"

import { db } from "@/database/db"
import {
    divisions,
    tournamentDivisions,
    tournamentMatches,
    tournamentPlacements,
    tournamentPools,
    tournamentTeams,
    tournaments
} from "@/database/schema"
import { asc, eq } from "drizzle-orm"
import {
    fail,
    ok,
    requirePositiveInt,
    requireSession,
    withAction,
    type ActionResult
} from "@/lib/action-helpers"
import {
    buildTournamentScheduleView,
    type TournamentScheduleView
} from "@/lib/tournament-schedule"
import {
    getPoolStandings,
    type PoolStandingRow
} from "@/lib/tournament-standings"
import type { DivisionPlacements } from "@/components/tournament/tournament-placements-card"

export interface DivisionPoolStandings {
    divisionId: number
    divisionName: string
    pools: Array<{ poolId: number; poolName: string; rows: PoolStandingRow[] }>
}

export interface TournamentResults {
    tournamentLabel: string
    view: TournamentScheduleView
    poolStandings: DivisionPoolStandings[]
    placements: DivisionPlacements[]
}

/**
 * Read-only results for any tournament by id: final placements, pool standings,
 * and pool/bracket match scores per division. Session-gated (any logged-in user);
 * unlike the live schedule view this is not limited to the active tournament.
 */
export const getTournamentResults = withAction(
    async (tournamentId: number): Promise<ActionResult<TournamentResults>> => {
        await requireSession()
        const id = requirePositiveInt(tournamentId, "tournament ID")

        const [t] = await db
            .select({
                id: tournaments.id,
                name: tournaments.name,
                year: tournaments.year,
                eliminationFormat: tournaments.elimination_format
            })
            .from(tournaments)
            .where(eq(tournaments.id, id))
            .limit(1)
        if (!t) return fail("Tournament not found.")

        // Divisions ordered by sort_order — the single ordering used page-wide.
        const divisionRows = await db
            .select({
                id: tournamentDivisions.id,
                divisionName: divisions.name,
                sortOrder: tournamentDivisions.sort_order
            })
            .from(tournamentDivisions)
            .innerJoin(
                divisions,
                eq(divisions.id, tournamentDivisions.division_id)
            )
            .where(eq(tournamentDivisions.tournament_id, id))
            .orderBy(asc(tournamentDivisions.sort_order))

        const [matches, teams, pools] = await Promise.all([
            db
                .select()
                .from(tournamentMatches)
                .where(eq(tournamentMatches.tournament_id, id)),
            db
                .select({ id: tournamentTeams.id, name: tournamentTeams.name })
                .from(tournamentTeams)
                .where(eq(tournamentTeams.tournament_id, id)),
            db
                .select()
                .from(tournamentPools)
                .where(eq(tournamentPools.tournament_id, id))
        ])

        const view = buildTournamentScheduleView({
            tournamentName: t.name,
            eliminationFormat: t.eliminationFormat as "single" | "double",
            myTeamId: null,
            divisions: divisionRows,
            matches,
            teams,
            pools
        })

        // Pool standings per division (rows are USAV tie-break ordered).
        const poolStandings: DivisionPoolStandings[] = []
        for (const div of divisionRows) {
            const divPools = pools
                .filter((p) => p.division_id === div.id)
                .sort((a, b) => a.name.localeCompare(b.name))
            if (divPools.length === 0) continue
            const poolResults = []
            for (const pool of divPools) {
                const rows = await getPoolStandings(pool.id)
                poolResults.push({
                    poolId: pool.id,
                    poolName: pool.name,
                    rows
                })
            }
            poolStandings.push({
                divisionId: div.id,
                divisionName: div.divisionName,
                pools: poolResults
            })
        }

        // Final placements, grouped by division in sort_order, ordered by place.
        const placementRows = await db
            .select({
                divisionId: tournamentPlacements.division_id,
                teamId: tournamentPlacements.team_id,
                teamName: tournamentTeams.name,
                place: tournamentPlacements.place
            })
            .from(tournamentPlacements)
            .innerJoin(
                tournamentTeams,
                eq(tournamentTeams.id, tournamentPlacements.team_id)
            )
            .where(eq(tournamentPlacements.tournament_id, id))
            .orderBy(asc(tournamentPlacements.place))

        const placements: DivisionPlacements[] = []
        for (const div of divisionRows) {
            const teamsForDiv = placementRows.filter(
                (r) => r.divisionId === div.id
            )
            if (teamsForDiv.length === 0) continue
            placements.push({
                divisionId: div.id,
                divisionName: div.divisionName,
                teams: teamsForDiv.map((r) => ({
                    teamId: r.teamId,
                    teamName: r.teamName,
                    place: r.place
                }))
            })
        }

        return ok({
            tournamentLabel: `${t.name} (${t.year})`,
            view,
            poolStandings,
            placements
        })
    }
)
