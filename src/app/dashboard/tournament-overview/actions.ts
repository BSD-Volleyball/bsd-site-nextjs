"use server"

import { db } from "@/database/db"
import {
    divisions,
    tournamentDivisions,
    tournamentRoster,
    tournamentTeams,
    tournamentWaitlist,
    tournaments,
    users
} from "@/database/schema"
import { and, asc, eq, isNull, sql } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { formatPlayerName } from "@/lib/utils"

export interface OverviewPlayer {
    userId: string
    name: string
    male: boolean | null
    isCaptain: boolean
}

export interface OverviewTeam {
    id: number
    name: string
    captainUserId: string
    captainName: string
    preferredDivisionId: number
    finalDivisionId: number | null
    amountPaid: string | null
    roster: OverviewPlayer[]
}

export interface OverviewDivision {
    id: number
    name: string
    teamCap: number
    malePerTeam: number
    nonMalePerTeam: number
    teams: OverviewTeam[]
}

export interface TournamentOverviewData {
    tournament: {
        id: number
        name: string
        phase: string
        tournamentDate: string
        tournamentType: string
        poolSize: number
        eliminationFormat: string
        cost: string | null
        lateCost: string | null
    }
    divisions: OverviewDivision[]
    unassignedTeams: OverviewTeam[]
    totals: {
        teamCount: number
        rosteredPlayerCount: number
        waitlistCount: number
    }
}

export async function getTournamentOverview(): Promise<{
    status: boolean
    message?: string
    data: TournamentOverviewData | null
}> {
    const hasAccess = await isAdminOrDirectorBySession()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized", data: null }
    }

    const [t] = await db
        .select({
            id: tournaments.id,
            name: tournaments.name,
            phase: tournaments.phase,
            tournament_date: tournaments.tournament_date,
            tournament_type: tournaments.tournament_type,
            pool_size: tournaments.pool_size,
            elimination_format: tournaments.elimination_format,
            cost: tournaments.cost,
            late_cost: tournaments.late_cost
        })
        .from(tournaments)
        .orderBy(asc(tournaments.id))
        .limit(1)

    if (!t) {
        return { status: true, data: null }
    }

    const divisionRows = await db
        .select({
            id: tournamentDivisions.id,
            name: divisions.name,
            sort_order: tournamentDivisions.sort_order,
            team_count: tournamentDivisions.team_count,
            male_per_team: tournamentDivisions.male_per_team,
            non_male_per_team: tournamentDivisions.non_male_per_team
        })
        .from(tournamentDivisions)
        .innerJoin(divisions, eq(divisions.id, tournamentDivisions.division_id))
        .where(eq(tournamentDivisions.tournament_id, t.id))
        .orderBy(asc(tournamentDivisions.sort_order))

    const teamRows = await db
        .select({
            id: tournamentTeams.id,
            name: tournamentTeams.name,
            preferred_division_id: tournamentTeams.preferred_division_id,
            division_id: tournamentTeams.division_id,
            amount_paid: tournamentTeams.amount_paid,
            captain_user_id: tournamentTeams.captain_user_id,
            captain_first: users.first_name,
            captain_last: users.last_name,
            captain_preferred: users.preferred_name
        })
        .from(tournamentTeams)
        .innerJoin(users, eq(users.id, tournamentTeams.captain_user_id))
        .where(eq(tournamentTeams.tournament_id, t.id))
        .orderBy(asc(tournamentTeams.name))

    const rosterRows = await db
        .select({
            team_id: tournamentRoster.team_id,
            user_id: tournamentRoster.user_id,
            first_name: users.first_name,
            last_name: users.last_name,
            preferred_name: users.preferred_name,
            male: users.male
        })
        .from(tournamentRoster)
        .innerJoin(users, eq(users.id, tournamentRoster.user_id))
        .where(eq(tournamentRoster.tournament_id, t.id))
        .orderBy(asc(users.last_name), asc(users.first_name))

    const [waitlistCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tournamentWaitlist)
        .where(
            and(
                eq(tournamentWaitlist.tournament_id, t.id),
                isNull(tournamentWaitlist.placed_team_id)
            )
        )
    const waitlistCount = waitlistCountRow?.count ?? 0

    // Bucket roster rows by team
    const rosterByTeam = new Map<number, OverviewPlayer[]>()
    for (const r of rosterRows) {
        const team = teamRows.find((tm) => tm.id === r.team_id)
        const isCaptain = team?.captain_user_id === r.user_id
        const player: OverviewPlayer = {
            userId: r.user_id,
            name: formatPlayerName(r.first_name, r.last_name, r.preferred_name),
            male: r.male,
            isCaptain
        }
        const arr = rosterByTeam.get(r.team_id) ?? []
        arr.push(player)
        rosterByTeam.set(r.team_id, arr)
    }
    // Captain first, then alphabetical (already alpha from query).
    for (const [k, arr] of rosterByTeam) {
        arr.sort((a, b) => {
            if (a.isCaptain && !b.isCaptain) return -1
            if (!a.isCaptain && b.isCaptain) return 1
            return a.name.localeCompare(b.name)
        })
        rosterByTeam.set(k, arr)
    }

    const teams: OverviewTeam[] = teamRows.map((tm) => ({
        id: tm.id,
        name: tm.name,
        captainUserId: tm.captain_user_id,
        captainName: formatPlayerName(
            tm.captain_first,
            tm.captain_last,
            tm.captain_preferred
        ),
        preferredDivisionId: tm.preferred_division_id,
        finalDivisionId: tm.division_id,
        amountPaid: tm.amount_paid,
        roster: rosterByTeam.get(tm.id) ?? []
    }))

    const overviewDivisions: OverviewDivision[] = divisionRows.map((d) => ({
        id: d.id,
        name: d.name,
        teamCap: d.team_count,
        malePerTeam: d.male_per_team,
        nonMalePerTeam: d.non_male_per_team,
        teams: teams.filter(
            // Final division (admin-assigned) wins; fall back to preferred.
            (tm) => (tm.finalDivisionId ?? tm.preferredDivisionId) === d.id
        )
    }))

    const unassignedTeams = teams.filter((tm) => {
        const div = tm.finalDivisionId ?? tm.preferredDivisionId
        return !divisionRows.some((d) => d.id === div)
    })

    return {
        status: true,
        data: {
            tournament: {
                id: t.id,
                name: t.name,
                phase: t.phase,
                tournamentDate: t.tournament_date,
                tournamentType: t.tournament_type,
                poolSize: t.pool_size,
                eliminationFormat: t.elimination_format,
                cost: t.cost,
                lateCost: t.late_cost
            },
            divisions: overviewDivisions,
            unassignedTeams,
            totals: {
                teamCount: teams.length,
                rosteredPlayerCount: rosterRows.length,
                waitlistCount
            }
        }
    }
}
