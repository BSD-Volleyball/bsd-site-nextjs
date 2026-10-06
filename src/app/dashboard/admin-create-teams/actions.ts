"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import { withAction, ok, fail, requirePositiveInt } from "@/next/action-helpers"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { teams, userRoles } from "@/database/schema"
import { logAuditEntry } from "@/lib/audit-log"
import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"

interface TeamToCreate {
    captainId: string
    captain2Id?: string
    teamName: string
}

export const createTeams = withAction(
    async (
        seasonId: number,
        divisionId: number,
        teamsToCreate: TeamToCreate[]
    ): Promise<ActionResult> => {
        requirePositiveInt(seasonId, "season ID")
        requirePositiveInt(divisionId, "division ID")
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        if (!seasonId || !divisionId) {
            return fail("Please select a season and division.")
        }

        if (teamsToCreate.length === 0) {
            return fail("Please select at least one captain.")
        }

        // Validate all teams have captains and names
        for (let i = 0; i < teamsToCreate.length; i++) {
            const team = teamsToCreate[i]
            if (!team.captainId) {
                return fail(`Please select a captain for team ${i + 1}.`)
            }
            if (!team.teamName.trim()) {
                return fail(`Please enter a name for team ${i + 1}.`)
            }
        }

        try {
            // Create all teams
            await db.insert(teams).values(
                teamsToCreate.map((team, index) => ({
                    season: seasonId,
                    captain: team.captainId,
                    captain2: team.captain2Id || null,
                    division: divisionId,
                    name: team.teamName.trim(),
                    number: index + 1
                }))
            )

            // Sync captain roles to user_roles (new RBAC system)
            const roleInserts = teamsToCreate.flatMap((team) => {
                const roles = [
                    {
                        user_id: team.captainId,
                        role: "captain",
                        season_id: seasonId,
                        division_id: divisionId
                    }
                ]
                if (team.captain2Id) {
                    roles.push({
                        user_id: team.captain2Id,
                        role: "captain",
                        season_id: seasonId,
                        division_id: divisionId
                    })
                }
                return roles
            })
            await db.insert(userRoles).values(roleInserts).onConflictDoNothing()

            const actorId = await getSessionUserId()
            if (actorId) {
                await logAuditEntry({
                    userId: actorId,
                    action: "create",
                    entityType: "teams",
                    summary: `Created ${teamsToCreate.length} teams for season ${seasonId}, division ${divisionId}`
                })
            }

            revalidatePath("/dashboard/admin-create-teams")
            revalidateCalendarFeeds()
            return ok(
                undefined,
                `Successfully created ${teamsToCreate.length} teams!`
            )
        } catch (error) {
            logger.error("Error creating teams", undefined, error)
            return fail("Something went wrong while creating teams.")
        }
    }
)
