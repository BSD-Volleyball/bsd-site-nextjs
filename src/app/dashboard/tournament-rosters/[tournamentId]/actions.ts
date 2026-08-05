"use server"

import { db } from "@/database/db"
import {
    divisions,
    tournamentDivisions,
    tournamentRoster,
    tournamentTeams,
    tournaments,
    users
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
import { formatDisplayName } from "@/lib/utils"

export interface TournamentRosterPlayer {
    userId: string
    name: string
    isCaptain: boolean
}

export interface TournamentRosterTeam {
    id: number
    name: string
    players: TournamentRosterPlayer[]
}

export interface TournamentRosterDivision {
    id: number
    name: string
    teams: TournamentRosterTeam[]
}

export interface TournamentRosters {
    tournamentLabel: string
    divisions: TournamentRosterDivision[]
}

/**
 * Read-only rosters for any tournament by id: teams per division with their
 * players, captain first. Session-gated (any logged-in user).
 */
export const getTournamentRosters = withAction(
    async (tournamentId: number): Promise<ActionResult<TournamentRosters>> => {
        await requireSession()
        const id = requirePositiveInt(tournamentId, "tournament ID")

        const [t] = await db
            .select({
                id: tournaments.id,
                name: tournaments.name,
                year: tournaments.year
            })
            .from(tournaments)
            .where(eq(tournaments.id, id))
            .limit(1)
        if (!t) return fail("Tournament not found.")

        const [divisionRows, teamRows, rosterRows] = await Promise.all([
            db
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
                .orderBy(asc(tournamentDivisions.sort_order)),
            db
                .select({
                    id: tournamentTeams.id,
                    name: tournamentTeams.name,
                    divisionId: tournamentTeams.division_id,
                    captainUserId: tournamentTeams.captain_user_id
                })
                .from(tournamentTeams)
                .where(eq(tournamentTeams.tournament_id, id))
                .orderBy(asc(tournamentTeams.order_id)),
            db
                .select({
                    teamId: tournamentRoster.team_id,
                    userId: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name
                })
                .from(tournamentRoster)
                .innerJoin(users, eq(users.id, tournamentRoster.user_id))
                .where(eq(tournamentRoster.tournament_id, id))
        ])

        const playersByTeam = new Map<number, typeof rosterRows>()
        for (const r of rosterRows) {
            const arr = playersByTeam.get(r.teamId) ?? []
            arr.push(r)
            playersByTeam.set(r.teamId, arr)
        }

        const buildTeam = (team: (typeof teamRows)[number]) => {
            const players = (playersByTeam.get(team.id) ?? [])
                .map((p) => ({
                    userId: p.userId,
                    name: formatDisplayName(
                        p.firstName,
                        p.lastName,
                        p.preferredName
                    ),
                    isCaptain: p.userId === team.captainUserId
                }))
                .sort(
                    (a, b) =>
                        Number(b.isCaptain) - Number(a.isCaptain) ||
                        a.name.localeCompare(b.name)
                )
            return { id: team.id, name: team.name, players }
        }

        const rosterDivisions: TournamentRosterDivision[] = divisionRows
            .map((div) => ({
                id: div.id,
                name: div.divisionName,
                teams: teamRows
                    .filter((team) => team.divisionId === div.id)
                    .map(buildTeam)
            }))
            .filter((div) => div.teams.length > 0)

        return ok({
            tournamentLabel: `${t.name} (${t.year})`,
            divisions: rosterDivisions
        })
    }
)
