"use server"

import { db } from "@/database/db"
import { auth } from "@/lib/auth"
import {
    users,
    seasons,
    divisions,
    teams,
    drafts,
    commissioners
} from "@/database/schema"
import { eq, and, inArray } from "drizzle-orm"
import { headers } from "next/headers"

interface RosterPlayer {
    id: string
    displayName: string
    lastName: string
    isCaptain: boolean
}

interface RosterTeam {
    id: number
    name: string
    number: number | null
    players: RosterPlayer[]
}

interface RosterDivision {
    id: number
    name: string
    level: number
    commissioners: string[]
    teams: RosterTeam[]
}

interface RosterData {
    status: boolean
    message?: string
    seasonLabel: string
    divisions: RosterDivision[]
}

export async function getRosterData(seasonId: number): Promise<RosterData> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return {
            status: false,
            message: "Not authenticated.",
            seasonLabel: "",
            divisions: []
        }
    }

    if (!Number.isInteger(seasonId) || seasonId <= 0) {
        return {
            status: false,
            message: "Invalid season.",
            seasonLabel: "",
            divisions: []
        }
    }

    try {
        const [seasonRow] = await db
            .select({
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1)

        if (!seasonRow) {
            return {
                status: false,
                message: "Season not found.",
                seasonLabel: "",
                divisions: []
            }
        }

        const seasonLabel = `${seasonRow.season.charAt(0).toUpperCase() + seasonRow.season.slice(1)} ${seasonRow.year}`

        const teamRows = await db
            .select({
                id: teams.id,
                name: teams.name,
                number: teams.number,
                captain: teams.captain,
                divisionId: teams.division
            })
            .from(teams)
            .where(eq(teams.season, seasonId))
            .orderBy(teams.number)

        if (teamRows.length === 0) {
            return {
                status: true,
                seasonLabel,
                divisions: []
            }
        }

        const divisionIds = [...new Set(teamRows.map((t) => t.divisionId))]

        const divisionRows = await db
            .select({
                id: divisions.id,
                name: divisions.name,
                level: divisions.level
            })
            .from(divisions)
            .where(inArray(divisions.id, divisionIds))
            .orderBy(divisions.level)

        const commissionerRows = await db
            .select({
                divisionId: commissioners.division,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name
            })
            .from(commissioners)
            .innerJoin(users, eq(commissioners.commissioner, users.id))
            .where(
                and(
                    eq(commissioners.season, seasonId),
                    inArray(commissioners.division, divisionIds)
                )
            )

        const commissionersByDivision = new Map<number, string[]>()
        for (const c of commissionerRows) {
            const displayName = c.preferredName || c.firstName
            const arr = commissionersByDivision.get(c.divisionId) || []
            arr.push(`${displayName} ${c.lastName}`)
            commissionersByDivision.set(c.divisionId, arr)
        }

        const teamIds = teamRows.map((t) => t.id)

        const draftRows = await db
            .select({
                teamId: drafts.team,
                userId: drafts.user,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name
            })
            .from(drafts)
            .innerJoin(users, eq(drafts.user, users.id))
            .where(inArray(drafts.team, teamIds))

        const captainMap = new Map(teamRows.map((t) => [t.id, t.captain]))

        const playersByTeam = new Map<number, RosterPlayer[]>()
        for (const row of draftRows) {
            const displayName = row.preferredName || row.firstName
            const player: RosterPlayer = {
                id: row.userId,
                displayName,
                lastName: row.lastName,
                isCaptain: row.userId === captainMap.get(row.teamId)
            }
            const arr = playersByTeam.get(row.teamId) || []
            arr.push(player)
            playersByTeam.set(row.teamId, arr)
        }

        // Sort players alphabetically by last name, then first name
        for (const players of playersByTeam.values()) {
            players.sort((a, b) => {
                const lastCmp = a.lastName
                    .toLowerCase()
                    .localeCompare(b.lastName.toLowerCase())
                if (lastCmp !== 0) return lastCmp
                return a.displayName
                    .toLowerCase()
                    .localeCompare(b.displayName.toLowerCase())
            })
        }

        const teamsByDivision = new Map<number, RosterTeam[]>()
        for (const t of teamRows) {
            const rosterTeam: RosterTeam = {
                id: t.id,
                name: t.name,
                number: t.number,
                players: playersByTeam.get(t.id) || []
            }
            const arr = teamsByDivision.get(t.divisionId) || []
            arr.push(rosterTeam)
            teamsByDivision.set(t.divisionId, arr)
        }

        const rosterDivisions: RosterDivision[] = divisionRows.map((d) => ({
            id: d.id,
            name: d.name,
            level: d.level,
            commissioners: commissionersByDivision.get(d.id) || [],
            teams: teamsByDivision.get(d.id) || []
        }))

        return {
            status: true,
            seasonLabel,
            divisions: rosterDivisions
        }
    } catch (error) {
        console.error("Error fetching roster data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasonLabel: "",
            divisions: []
        }
    }
}
