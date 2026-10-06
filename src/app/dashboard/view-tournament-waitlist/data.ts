import "server-only"

import { formatPlayerName } from "@/lib/utils"
import { db } from "@/database/db"
import {
    divisions,
    tournamentDivisions,
    tournamentRoster,
    tournamentTeams,
    tournamentWaitlist,
    users
} from "@/database/schema"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import {
    ok,
    requireAdmin,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import { getTournamentConfig } from "@/lib/tournament-config"

export interface WaitlistEntry {
    waitlistId: number
    userId: string
    name: string
    email: string
    male: boolean | null
    preferredDivisionName: string | null
    createdAt: Date
}

export interface PlacementTarget {
    teamId: number
    teamName: string
    captainName: string
    divisionName: string
    malesRemaining: number
    nonMalesRemaining: number
}

export const getTournamentWaitlist = withAction(
    async (): Promise<
        ActionResult<{
            tournamentId: number
            tournamentName: string
            waitlist: WaitlistEntry[]
            placementTargets: PlacementTarget[]
        } | null>
    > => {
        await requireAdmin()
        const config = await getTournamentConfig()
        if (!config) return ok(null)

        // Left-join the preferred division — null when the player didn't
        // pick one (or the division was later deleted).
        const rows = await db
            .select({
                waitlistId: tournamentWaitlist.id,
                userId: tournamentWaitlist.user_id,
                createdAt: tournamentWaitlist.created_at,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name,
                email: users.email,
                male: users.male,
                preferredDivisionName: divisions.name
            })
            .from(tournamentWaitlist)
            .innerJoin(users, eq(users.id, tournamentWaitlist.user_id))
            .leftJoin(
                tournamentDivisions,
                eq(
                    tournamentDivisions.id,
                    tournamentWaitlist.preferred_division_id
                )
            )
            .leftJoin(
                divisions,
                eq(divisions.id, tournamentDivisions.division_id)
            )
            .where(
                and(
                    eq(tournamentWaitlist.tournament_id, config.tournamentId),
                    // Only show entries not yet placed on a team — placed
                    // rows stay in the table as a waiver-acceptance record.
                    isNull(tournamentWaitlist.placed_team_id)
                )
            )
            .orderBy(asc(tournamentWaitlist.created_at))

        const waitlist: WaitlistEntry[] = rows.map((r) => ({
            waitlistId: r.waitlistId,
            userId: r.userId,
            name: formatPlayerName(r.first_name, r.last_name, r.preferred_name),
            email: r.email,
            male: r.male,
            preferredDivisionName: r.preferredDivisionName,
            createdAt: r.createdAt
        }))

        // Build placement targets: for each team, compute remaining capacity by gender.
        const teams = await db
            .select({
                id: tournamentTeams.id,
                name: tournamentTeams.name,
                captainId: tournamentTeams.captain_user_id,
                preferredDivisionId: tournamentTeams.preferred_division_id,
                finalDivisionId: tournamentTeams.division_id
            })
            .from(tournamentTeams)
            .where(eq(tournamentTeams.tournament_id, config.tournamentId))

        const captainNames = new Map<string, string>()
        if (teams.length > 0) {
            const captainRows = await db
                .select({
                    id: users.id,
                    first_name: users.first_name,
                    last_name: users.last_name,
                    preferred_name: users.preferred_name
                })
                .from(users)
                .where(
                    inArray(
                        users.id,
                        teams.map((t) => t.captainId)
                    )
                )
            for (const c of captainRows) {
                captainNames.set(
                    c.id,
                    formatPlayerName(
                        c.first_name,
                        c.last_name,
                        c.preferred_name
                    )
                )
            }
        }

        // Pull tournament divisions joined with the league `divisions` table
        // so we can show a friendly name (e.g. "A", "BB") in the placement UI.
        const divs = await db
            .select({
                id: tournamentDivisions.id,
                name: divisions.name,
                male_per_team: tournamentDivisions.male_per_team,
                non_male_per_team: tournamentDivisions.non_male_per_team
            })
            .from(tournamentDivisions)
            .innerJoin(
                divisions,
                eq(divisions.id, tournamentDivisions.division_id)
            )
            .where(eq(tournamentDivisions.tournament_id, config.tournamentId))
        const divMap = new Map(divs.map((d) => [d.id, d]))

        const allRoster =
            teams.length === 0
                ? []
                : await db
                      .select({
                          teamId: tournamentRoster.team_id,
                          userId: tournamentRoster.user_id,
                          male: users.male
                      })
                      .from(tournamentRoster)
                      .innerJoin(users, eq(users.id, tournamentRoster.user_id))
                      .where(
                          inArray(
                              tournamentRoster.team_id,
                              teams.map((t) => t.id)
                          )
                      )

        const placementTargets: PlacementTarget[] = teams
            .map((t) => {
                const divId = t.finalDivisionId ?? t.preferredDivisionId
                const div = divMap.get(divId)
                if (!div) return null
                const tr = allRoster.filter((r) => r.teamId === t.id)
                const males = tr.filter((r) => r.male === true).length
                const nonMales = tr.filter((r) => r.male === false).length
                return {
                    teamId: t.id,
                    teamName: t.name,
                    captainName: captainNames.get(t.captainId) ?? "—",
                    divisionName: div.name,
                    malesRemaining: Math.max(0, div.male_per_team - males),
                    nonMalesRemaining: Math.max(
                        0,
                        div.non_male_per_team - nonMales
                    )
                }
            })
            .filter((p): p is PlacementTarget => p !== null)

        return ok({
            tournamentId: config.tournamentId,
            tournamentName: config.name,
            waitlist,
            placementTargets
        })
    }
)
