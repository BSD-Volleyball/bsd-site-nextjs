"use server"

import { db } from "@/database/db"
import { users, seasons, divisions, teams, drafts } from "@/database/schema"
import { eq, and, inArray } from "drizzle-orm"

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

interface RosterData {
    status: boolean
    message?: string
    seasonLabel: string
    divisionName: string
    teams: RosterTeam[]
}

export async function getRosterData(
    seasonId: number,
    divisionId: number
): Promise<RosterData> {
    try {
        const [seasonRow] = await db
            .select({
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1)

        const [divisionRow] = await db
            .select({ name: divisions.name })
            .from(divisions)
            .where(eq(divisions.id, divisionId))
            .limit(1)

        if (!seasonRow || !divisionRow) {
            return {
                status: false,
                message: "Season or division not found.",
                seasonLabel: "",
                divisionName: "",
                teams: []
            }
        }

        const seasonLabel = `${seasonRow.season.charAt(0).toUpperCase() + seasonRow.season.slice(1)} ${seasonRow.year}`

        const teamRows = await db
            .select({
                id: teams.id,
                name: teams.name,
                number: teams.number,
                captain: teams.captain
            })
            .from(teams)
            .where(
                and(
                    eq(teams.season, seasonId),
                    eq(teams.division, divisionId)
                )
            )
            .orderBy(teams.number)

        if (teamRows.length === 0) {
            return {
                status: true,
                seasonLabel,
                divisionName: divisionRow.name,
                teams: []
            }
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

        const captainMap = new Map(
            teamRows.map((t) => [t.id, t.captain])
        )

        const playersByTeam = new Map<number, RosterPlayer[]>()
        for (const row of draftRows) {
            const displayName =
                row.preferredName || row.firstName
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

        // Sort players alphabetically by display name + last name
        for (const players of playersByTeam.values()) {
            players.sort((a, b) => {
                const nameA =
                    `${a.displayName} ${a.lastName}`.toLowerCase()
                const nameB =
                    `${b.displayName} ${b.lastName}`.toLowerCase()
                return nameA.localeCompare(nameB)
            })
        }

        const rosterTeams: RosterTeam[] = teamRows.map((t) => ({
            id: t.id,
            name: t.name,
            number: t.number,
            players: playersByTeam.get(t.id) || []
        }))

        return {
            status: true,
            seasonLabel,
            divisionName: divisionRow.name,
            teams: rosterTeams
        }
    } catch (error) {
        console.error("Error fetching roster data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasonLabel: "",
            divisionName: "",
            teams: []
        }
    }
}
