"use server"

import { db } from "@/database/db"
import {
    divisions,
    tournamentDivisions,
    tournamentMatches,
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

export interface DivisionPoolStandings {
    divisionId: number
    divisionName: string
    pools: Array<{ poolId: number; poolName: string; rows: PoolStandingRow[] }>
}

export interface TournamentPoolPlay {
    tournamentLabel: string
    view: TournamentScheduleView
    poolStandings: DivisionPoolStandings[]
}

/**
 * Read-only pool-play results for any tournament by id: pool standings and
 * pool match scores per division. Session-gated (any logged-in user).
 */
export const getTournamentPoolPlay = withAction(
    async (tournamentId: number): Promise<ActionResult<TournamentPoolPlay>> => {
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

        return ok({
            tournamentLabel: `${t.name} (${t.year})`,
            view,
            poolStandings
        })
    }
)
