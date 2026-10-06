import "server-only"

import { db } from "@/database/db"
import {
    divisions,
    tournamentDivisions,
    tournamentPlacements,
    tournamentTeams,
    tournaments
} from "@/database/schema"
import { asc, desc, eq } from "drizzle-orm"
import {
    ok,
    requireAdmin,
    requirePositiveInt,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import { type TournamentPhase } from "@/lib/tournament-phases"
import type { DivisionPlacements } from "@/components/tournament/tournament-placements-card"

export interface TournamentPhaseData {
    tournamentId: number
    label: string
    phase: TournamentPhase
}

export const getCurrentTournamentPhaseData = withAction(
    async (): Promise<ActionResult<TournamentPhaseData | null>> => {
        await requireAdmin()
        const [t] = await db
            .select({
                id: tournaments.id,
                name: tournaments.name,
                year: tournaments.year,
                phase: tournaments.phase
            })
            .from(tournaments)
            .orderBy(desc(tournaments.id))
            .limit(1)

        if (!t) return ok(null)

        return ok({
            tournamentId: t.id,
            label: `${t.name} (${t.year})`,
            phase: t.phase as TournamentPhase
        })
    }
)

/**
 * Read recorded final placements for a tournament, grouped by division and ordered
 * by division level then finishing place. Admin-gated.
 */
export const getTournamentPlacements = withAction(
    async (
        tournamentId: number
    ): Promise<ActionResult<DivisionPlacements[]>> => {
        await requireAdmin()
        const id = requirePositiveInt(tournamentId, "tournament ID")

        const rows = await db
            .select({
                divisionId: tournamentPlacements.division_id,
                divisionName: divisions.name,
                divisionLevel: divisions.level,
                teamId: tournamentPlacements.team_id,
                teamName: tournamentTeams.name,
                place: tournamentPlacements.place
            })
            .from(tournamentPlacements)
            .innerJoin(
                tournamentTeams,
                eq(tournamentTeams.id, tournamentPlacements.team_id)
            )
            .innerJoin(
                tournamentDivisions,
                eq(tournamentDivisions.id, tournamentPlacements.division_id)
            )
            .innerJoin(
                divisions,
                eq(divisions.id, tournamentDivisions.division_id)
            )
            .where(eq(tournamentPlacements.tournament_id, id))
            .orderBy(asc(divisions.level), asc(tournamentPlacements.place))

        const byDivision = new Map<number, DivisionPlacements>()
        for (const r of rows) {
            let group = byDivision.get(r.divisionId)
            if (!group) {
                group = {
                    divisionId: r.divisionId,
                    divisionName: r.divisionName,
                    teams: []
                }
                byDivision.set(r.divisionId, group)
            }
            group.teams.push({
                teamId: r.teamId,
                teamName: r.teamName,
                place: r.place
            })
        }

        return ok([...byDivision.values()])
    }
)
