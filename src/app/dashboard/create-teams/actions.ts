"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users, divisions, teams, signups } from "@/database/schema"
import { eq, and, inArray } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { getIsCommissioner } from "@/app/dashboard/actions"
import { getSeasonConfig } from "@/lib/site-config"

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

export async function getCreateTeamsData(): Promise<{
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    divisions: DivisionOption[]
    users: UserOption[]
}> {
    const hasAccess = await getIsCommissioner()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            seasonId: 0,
            seasonLabel: "",
            divisions: [],
            users: []
        }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                seasonId: 0,
                seasonLabel: "",
                divisions: [],
                users: []
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        const [allDivisions, signedUpUsers] = await Promise.all([
            db
                .select({
                    id: divisions.id,
                    name: divisions.name,
                    level: divisions.level
                })
                .from(divisions)
                .where(eq(divisions.active, true))
                .orderBy(divisions.level),
            db
                .selectDistinct({
                    id: users.id,
                    old_id: users.old_id,
                    first_name: users.first_name,
                    last_name: users.last_name,
                    preffered_name: users.preffered_name
                })
                .from(signups)
                .innerJoin(users, eq(signups.player, users.id))
                .where(eq(signups.season, config.seasonId))
                .orderBy(users.last_name, users.first_name)
        ])

        return {
            status: true,
            seasonId: config.seasonId,
            seasonLabel,
            divisions: allDivisions,
            users: signedUpUsers
        }
    } catch (error) {
        console.error("Error fetching create teams data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasonId: 0,
            seasonLabel: "",
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
    divisionId: number,
    teamsToCreate: TeamToCreate[]
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await getIsCommissioner()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to perform this action."
        }
    }

    if (!divisionId) {
        return {
            status: false,
            message: "Please select a division."
        }
    }

    if (teamsToCreate.length === 0) {
        return {
            status: false,
            message: "Please select at least one captain."
        }
    }

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return {
            status: false,
            message: "No current season found."
        }
    }

    const [selectedDivision] = await db
        .select({ id: divisions.id, name: divisions.name })
        .from(divisions)
        .where(eq(divisions.id, divisionId))
        .limit(1)

    if (!selectedDivision) {
        return {
            status: false,
            message: "Invalid division selected."
        }
    }

    const expectedTeamCount =
        selectedDivision.name.trim().toUpperCase() === "BB" ? 4 : 6

    if (teamsToCreate.length !== expectedTeamCount) {
        return {
            status: false,
            message: `Division ${selectedDivision.name} requires ${expectedTeamCount} teams.`
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

    const captainIds = teamsToCreate.map((team) => team.captainId)
    const uniqueCaptainIds = new Set(captainIds)

    if (uniqueCaptainIds.size !== captainIds.length) {
        return {
            status: false,
            message: "Each team must have a unique captain."
        }
    }

    const signedUpCaptains = await db
        .select({ playerId: signups.player })
        .from(signups)
        .where(
            and(
                eq(signups.season, config.seasonId),
                inArray(signups.player, [...uniqueCaptainIds])
            )
        )

    if (signedUpCaptains.length !== uniqueCaptainIds.size) {
        return {
            status: false,
            message:
                "All selected captains must be signed up for the current season."
        }
    }

    try {
        // Create all teams for the current season
        await db.insert(teams).values(
            teamsToCreate.map((team, index) => ({
                season: config.seasonId,
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
                summary: `Created ${teamsToCreate.length} teams for current season ${config.seasonId}, division ${divisionId}`
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
