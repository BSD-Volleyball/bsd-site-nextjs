"use server"

import { db } from "@/database/db"
import {
    divisions,
    tournamentDivisions,
    tournamentMatches,
    tournamentPlacements,
    tournamentTeams,
    tournaments
} from "@/database/schema"
import { asc, eq, ne, and } from "drizzle-orm"
import {
    fail,
    ok,
    requirePositiveInt,
    requireSession,
    withAction,
    type ActionResult
} from "@/lib/action-helpers"
import {
    buildTournamentBracket,
    type TournamentBracketRow
} from "@/lib/tournament-bracket-adapter"
import type { BracketMatch } from "@/lib/playoff-bracket-types"
import type { DivisionPlacements } from "@/components/tournament/tournament-placements-card"

export interface TournamentPlayoffDivision {
    id: number
    name: string
    bracket: { upper: BracketMatch[]; lower: BracketMatch[] } | null
}

export interface TournamentPlayoffs {
    tournamentLabel: string
    eliminationFormat: "single" | "double"
    placements: DivisionPlacements[]
    divisions: TournamentPlayoffDivision[]
}

/**
 * Read-only playoff results for any tournament by id: final placements plus a
 * per-division bracket in the shape BracketView renders. Session-gated (any
 * logged-in user).
 */
export const getTournamentPlayoffs = withAction(
    async (tournamentId: number): Promise<ActionResult<TournamentPlayoffs>> => {
        await requireSession()
        const id = requirePositiveInt(tournamentId, "tournament ID")

        const [t] = await db
            .select({
                id: tournaments.id,
                name: tournaments.name,
                year: tournaments.year,
                date: tournaments.tournament_date,
                eliminationFormat: tournaments.elimination_format
            })
            .from(tournaments)
            .where(eq(tournaments.id, id))
            .limit(1)
        if (!t) return fail("Tournament not found.")

        const divisionRows = await db
            .select({
                id: tournamentDivisions.id,
                divisionName: divisions.name
            })
            .from(tournamentDivisions)
            .innerJoin(
                divisions,
                eq(divisions.id, tournamentDivisions.division_id)
            )
            .where(eq(tournamentDivisions.tournament_id, id))
            .orderBy(asc(tournamentDivisions.sort_order))

        const [bracketRows, teams, placementRows] = await Promise.all([
            db
                .select({
                    id: tournamentMatches.id,
                    divisionId: tournamentMatches.division_id,
                    bracket: tournamentMatches.bracket,
                    bracketRound: tournamentMatches.bracket_round,
                    bracketSlot: tournamentMatches.bracket_slot,
                    court: tournamentMatches.court,
                    startTime: tournamentMatches.start_time,
                    homeTeamId: tournamentMatches.home_team_id,
                    awayTeamId: tournamentMatches.away_team_id,
                    homeSet1: tournamentMatches.home_set1_score,
                    awaySet1: tournamentMatches.away_set1_score,
                    homeSet2: tournamentMatches.home_set2_score,
                    awaySet2: tournamentMatches.away_set2_score,
                    homeSet3: tournamentMatches.home_set3_score,
                    awaySet3: tournamentMatches.away_set3_score,
                    winnerTeamId: tournamentMatches.winner_team_id
                })
                .from(tournamentMatches)
                .where(
                    and(
                        eq(tournamentMatches.tournament_id, id),
                        ne(tournamentMatches.bracket, "pool")
                    )
                ),
            db
                .select({ id: tournamentTeams.id, name: tournamentTeams.name })
                .from(tournamentTeams)
                .where(eq(tournamentTeams.tournament_id, id)),
            db
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
        ])

        const teamNames = new Map(teams.map((team) => [team.id, team.name]))

        const playoffDivisions: TournamentPlayoffDivision[] = divisionRows.map(
            (div) => {
                const rows: TournamentBracketRow[] = bracketRows.filter(
                    (m) => m.divisionId === div.id
                )
                return {
                    id: div.id,
                    name: div.divisionName,
                    bracket: buildTournamentBracket(rows, teamNames, t.date)
                }
            }
        )

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
            eliminationFormat: t.eliminationFormat as "single" | "double",
            placements,
            divisions: playoffDivisions
        })
    }
)
