"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users, seasons, divisions, teams } from "@/database/schema"
import { desc } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { isAdminOrDirectorBySession } from "@/lib/rbac"

export interface SeasonOption {
    id: number
    code: string
    year: number
    season: string
}

export interface DivisionOption {
    id: number
    name: string
    level: number
}

export interface UserOption {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preffered_name: string | null
}

async function checkAdminAccess(): Promise<boolean> {
    return isAdminOrDirectorBySession()
}

export async function getCreateTeamsData(): Promise<{
    status: boolean
    message?: string
    seasons: SeasonOption[]
    divisions: DivisionOption[]
    users: UserOption[]
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            seasons: [],
            divisions: [],
            users: []
        }
    }

    try {
        const [allSeasons, allDivisions, allUsers] = await Promise.all([
            db
                .select({
                    id: seasons.id,
                    code: seasons.code,
                    year: seasons.year,
                    season: seasons.season
                })
                .from(seasons)
                .orderBy(desc(seasons.year), desc(seasons.id)),
            db
                .select({
                    id: divisions.id,
                    name: divisions.name,
                    level: divisions.level
                })
                .from(divisions)
                .orderBy(divisions.level),
            db
                .select({
                    id: users.id,
                    old_id: users.old_id,
                    first_name: users.first_name,
                    last_name: users.last_name,
                    preffered_name: users.preffered_name
                })
                .from(users)
                .orderBy(users.last_name, users.first_name)
        ])

        return {
            status: true,
            seasons: allSeasons,
            divisions: allDivisions,
            users: allUsers
        }
    } catch (error) {
        console.error("Error fetching create teams data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasons: [],
            divisions: [],
            users: []
        }
    }
}

interface TeamToCreate {
    captainId: string
    teamName: string
}

export async function createTeams(
    seasonId: number,
    divisionId: number,
    teamsToCreate: TeamToCreate[]
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to perform this action."
        }
    }

    if (!seasonId || !divisionId) {
        return {
            status: false,
            message: "Please select a season and division."
        }
    }

    if (teamsToCreate.length === 0) {
        return {
            status: false,
            message: "Please select at least one captain."
        }
    }

    // Validate all teams have captains and names
    for (let i = 0; i < teamsToCreate.length; i++) {
        const team = teamsToCreate[i]
        if (!team.captainId) {
            return {
                status: false,
                message: `Please select a captain for team ${i + 1}.`
            }
        }
        if (!team.teamName.trim()) {
            return {
                status: false,
                message: `Please enter a name for team ${i + 1}.`
            }
        }
    }

    try {
        // Create all teams
        await db.insert(teams).values(
            teamsToCreate.map((team, index) => ({
                season: seasonId,
                captain: team.captainId,
                division: divisionId,
                name: team.teamName.trim(),
                number: index + 1
            }))
        )

        const session = await auth.api.getSession({ headers: await headers() })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "teams",
                summary: `Created ${teamsToCreate.length} teams for season ${seasonId}, division ${divisionId}`
            })
        }

        return {
            status: true,
            message: `Successfully created ${teamsToCreate.length} teams!`
        }
    } catch (error) {
        console.error("Error creating teams:", error)
        return {
            status: false,
            message: "Something went wrong while creating teams."
        }
    }
}
