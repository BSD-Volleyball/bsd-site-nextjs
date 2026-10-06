import "server-only"

import { formatPlayerName } from "@/lib/utils"
import { db } from "@/database/db"
import {
    tournamentRoster,
    tournamentTeams,
    users,
    waiverAcceptances
} from "@/database/schema"
import { and, eq, inArray } from "drizzle-orm"
import {
    ok,
    requireSession,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import { getTournamentConfig, isRosterLocked } from "@/lib/tournament-config"
import { getActiveWaiver } from "@/lib/waivers"

export interface TeamRosterEntry {
    userId: string
    name: string
    male: boolean | null
    addedByCaptain: boolean
    waiverAccepted: boolean
}

export interface CaptainTeamView {
    tournamentId: number
    tournamentName: string
    rosterLocked: boolean
    team: {
        id: number
        name: string
        preferredDivisionId: number
        finalDivisionId: number | null
    }
    divisions: {
        id: number
        name: string
        malePerTeam: number
        nonMalePerTeam: number
    }[]
    roster: TeamRosterEntry[]
    eligibleToAdd: {
        id: string
        name: string
        male: boolean | null
    }[]
}

export async function loadTeamForCaptain(
    tournamentId: number,
    captainUserId: string
) {
    const [team] = await db
        .select()
        .from(tournamentTeams)
        .where(
            and(
                eq(tournamentTeams.tournament_id, tournamentId),
                eq(tournamentTeams.captain_user_id, captainUserId)
            )
        )
        .limit(1)
    return team ?? null
}

export const getCaptainTeamView = withAction(
    async (): Promise<ActionResult<CaptainTeamView | null>> => {
        const session = await requireSession()
        const config = await getTournamentConfig()
        if (!config) return ok(null)

        const team = await loadTeamForCaptain(
            config.tournamentId,
            session.user.id
        )
        if (!team) return ok(null)

        const activeWaiver = await getActiveWaiver()

        const rosterRows = await db
            .select({
                userId: tournamentRoster.user_id,
                addedBy: tournamentRoster.added_by_user_id,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name,
                male: users.male
            })
            .from(tournamentRoster)
            .innerJoin(users, eq(users.id, tournamentRoster.user_id))
            .where(eq(tournamentRoster.team_id, team.id))

        let acceptedByUser = new Set<string>()
        if (activeWaiver && rosterRows.length > 0) {
            const accepts = await db
                .select({ userId: waiverAcceptances.user_id })
                .from(waiverAcceptances)
                .where(
                    and(
                        eq(waiverAcceptances.waiver_id, activeWaiver.id),
                        inArray(
                            waiverAcceptances.user_id,
                            rosterRows.map((r) => r.userId)
                        )
                    )
                )
            acceptedByUser = new Set(accepts.map((a) => a.userId))
        }

        const roster: TeamRosterEntry[] = rosterRows.map((r) => ({
            userId: r.userId,
            name: formatPlayerName(r.first_name, r.last_name, r.preferred_name),
            male: r.male,
            addedByCaptain:
                r.addedBy === session.user.id && r.userId !== session.user.id,
            waiverAccepted: acceptedByUser.has(r.userId)
        }))

        // Eligible to add: not currently rostered in any team for this tournament.
        const allRostered = await db
            .select({ userId: tournamentRoster.user_id })
            .from(tournamentRoster)
            .where(eq(tournamentRoster.tournament_id, config.tournamentId))
        const exclude = new Set(allRostered.map((r) => r.userId))
        const candidateRows = await db
            .select({
                id: users.id,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name,
                male: users.male
            })
            .from(users)
            .orderBy(users.last_name, users.first_name)
        const eligibleToAdd = candidateRows
            .filter((u) => !exclude.has(u.id))
            .map((u) => ({
                id: u.id,
                name: formatPlayerName(
                    u.first_name,
                    u.last_name,
                    u.preferred_name
                ),
                male: u.male
            }))

        return ok({
            tournamentId: config.tournamentId,
            tournamentName: config.name,
            rosterLocked: isRosterLocked(config),
            team: {
                id: team.id,
                name: team.name,
                preferredDivisionId: team.preferred_division_id,
                finalDivisionId: team.division_id
            },
            divisions: config.divisions.map((d) => ({
                id: d.id,
                name: d.divisionName,
                malePerTeam: d.malePerTeam,
                nonMalePerTeam: d.nonMalePerTeam
            })),
            roster,
            eligibleToAdd
        })
    }
)
