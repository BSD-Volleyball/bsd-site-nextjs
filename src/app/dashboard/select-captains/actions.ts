"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import { withAction, ok, fail } from "@/next/action-helpers"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    users,
    divisions,
    individual_divisions,
    teams,
    signups
} from "@/database/schema"
import { eq, and, inArray, asc } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"

import { getSeasonConfig } from "@/lib/site-config"
import { getSessionUserId, isCommissionerBySession } from "@/next/session"
import { commissionerCanWriteDivision, grantRole, revokeRole } from "@/lib/rbac"
import { GHOST_CAPTAIN_ID, isGhostCaptain } from "@/lib/ghost-captain"

interface TeamToCreate {
    captainId: string
    coach2Id?: string
    teamName: string
}

export const createTeams = withAction(
    async (
        divisionId: number,
        teamsToCreate: TeamToCreate[]
    ): Promise<ActionResult> => {
        const hasAccess = await isCommissionerBySession()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        if (!divisionId) {
            return fail("Please select a division.")
        }

        if (teamsToCreate.length === 0) {
            return fail("Please select at least one captain.")
        }

        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return fail("No current season found.")
        }

        const [selectedDivision] = await db
            .select({ id: divisions.id, name: divisions.name })
            .from(divisions)
            .where(eq(divisions.id, divisionId))
            .limit(1)

        if (!selectedDivision) {
            return fail("Invalid division selected.")
        }

        const callerId = await getSessionUserId()
        if (
            !callerId ||
            !(await commissionerCanWriteDivision(
                callerId,
                config.seasonId,
                divisionId
            ))
        ) {
            return fail("You don't have permission for this division.")
        }

        const numTeams =
            selectedDivision.name.trim().toUpperCase() === "BB" ? 4 : 6

        // Look up whether this division uses coaches mode
        const [indivDiv] = await db
            .select({ coaches: individual_divisions.coaches })
            .from(individual_divisions)
            .where(
                and(
                    eq(individual_divisions.season, config.seasonId),
                    eq(individual_divisions.division, divisionId)
                )
            )
            .limit(1)

        const isCoachesDiv = indivDiv?.coaches ?? false

        if (!isCoachesDiv) {
            // Strict validation for standard captain mode
            if (teamsToCreate.length !== numTeams) {
                return fail(
                    `Division ${selectedDivision.name} requires ${numTeams} teams.`
                )
            }

            for (let i = 0; i < teamsToCreate.length; i++) {
                const team = teamsToCreate[i]
                if (!team.teamName.trim()) {
                    return fail(`Please enter a name for team ${i + 1}.`)
                }
            }

            // Only enforce uniqueness and signup checks for real (non-ghost) captains
            const allCaptainIds = teamsToCreate
                .flatMap((t) => [
                    t.captainId || GHOST_CAPTAIN_ID,
                    t.coach2Id ?? ""
                ])
                .filter((id) => id && !isGhostCaptain(id))
            const uniqueAllCaptainIds = new Set(allCaptainIds)

            if (uniqueAllCaptainIds.size !== allCaptainIds.length) {
                return fail("Each captain must be unique across all teams.")
            }

            // Every referenced user id must exist — otherwise the insert dies
            // on an FK violation with a generic error message.
            if (allCaptainIds.length > 0) {
                const existingUsers = await db
                    .select({ id: users.id })
                    .from(users)
                    .where(inArray(users.id, allCaptainIds))
                if (existingUsers.length !== uniqueAllCaptainIds.size) {
                    return fail(
                        "One or more selected captains could not be found."
                    )
                }
            }

            const realPrimaryCaptainIds = teamsToCreate
                .map((team) => team.captainId || GHOST_CAPTAIN_ID)
                .filter((id) => !isGhostCaptain(id))
            const uniqueRealPrimaryCaptainIds = new Set(realPrimaryCaptainIds)

            if (uniqueRealPrimaryCaptainIds.size > 0) {
                const signedUpCaptains = await db
                    .select({ playerId: signups.player })
                    .from(signups)
                    .where(
                        and(
                            eq(signups.season, config.seasonId),
                            inArray(signups.player, [
                                ...uniqueRealPrimaryCaptainIds
                            ])
                        )
                    )

                if (
                    signedUpCaptains.length !== uniqueRealPrimaryCaptainIds.size
                ) {
                    return fail(
                        "All selected primary captains must be signed up for the current season."
                    )
                }
            }
        } else {
            // Lenient validation for coaches mode — partial saves are allowed
            for (let i = 0; i < teamsToCreate.length; i++) {
                const team = teamsToCreate[i]
                const hasAnyCoach = team.captainId || team.coach2Id
                if (hasAnyCoach && !team.teamName.trim()) {
                    return fail(`Please enter a name for team ${i + 1}.`)
                }
            }

            const allCoachIds = teamsToCreate.flatMap((t) =>
                [t.captainId, t.coach2Id ?? ""].filter(Boolean)
            )
            const uniqueCoachIds = new Set(allCoachIds)

            if (uniqueCoachIds.size !== allCoachIds.length) {
                return fail("Each coach must be unique across all teams.")
            }

            // Coaches are drawn from the full user population — no sign-up check needed
        }

        try {
            // Fetch existing teams for this division+season to support upsert
            const existingTeams = await db
                .select({
                    id: teams.id,
                    number: teams.number,
                    captain: teams.captain,
                    captain2: teams.captain2
                })
                .from(teams)
                .where(
                    and(
                        eq(teams.season, config.seasonId),
                        eq(teams.division, divisionId)
                    )
                )
                .orderBy(asc(teams.number))

            const oldCaptainIds = new Set<string>(
                existingTeams
                    .flatMap((t) => [t.captain, t.captain2 ?? ""])
                    .filter((id): id is string => !!id && !isGhostCaptain(id))
            )

            const existingByNumber = new Map<number, number>()
            for (const team of existingTeams) {
                if (team.number !== null) {
                    existingByNumber.set(team.number, team.id)
                }
            }

            // Unified storage: all divisions use captain2 column instead of
            // duplicate rows. One transaction so a mid-loop failure can't
            // leave the division with a half-updated team list.
            await db.transaction(async (tx) => {
                for (let i = 0; i < teamsToCreate.length; i++) {
                    const team = teamsToCreate[i]
                    const number = i + 1

                    if (isCoachesDiv) {
                        // Coaches mode: both coaches optional, skip team if neither is set
                        const hasAnyCoach = team.captainId || team.coach2Id
                        if (!hasAnyCoach) continue

                        const existingId = existingByNumber.get(number)
                        if (existingId !== undefined) {
                            await tx
                                .update(teams)
                                .set({
                                    captain: team.captainId || GHOST_CAPTAIN_ID,
                                    captain2: team.coach2Id || null,
                                    name: team.teamName.trim()
                                })
                                .where(eq(teams.id, existingId))
                            existingByNumber.delete(number)
                        } else {
                            await tx.insert(teams).values({
                                season: config.seasonId,
                                captain: team.captainId || GHOST_CAPTAIN_ID,
                                captain2: team.coach2Id || null,
                                division: divisionId,
                                name: team.teamName.trim(),
                                number
                            })
                        }
                    } else {
                        // Standard captain mode
                        const existingId = existingByNumber.get(number)
                        const captainId = team.captainId || GHOST_CAPTAIN_ID

                        if (existingId !== undefined) {
                            await tx
                                .update(teams)
                                .set({
                                    captain: captainId,
                                    captain2: team.coach2Id || null,
                                    name: team.teamName.trim()
                                })
                                .where(eq(teams.id, existingId))
                            existingByNumber.delete(number)
                        } else {
                            await tx.insert(teams).values({
                                season: config.seasonId,
                                captain: captainId,
                                captain2: team.coach2Id || null,
                                division: divisionId,
                                name: team.teamName.trim(),
                                number
                            })
                        }
                    }
                }

                // Delete any stale teams (slots no longer filled)
                const staleIds = [...existingByNumber.values()]
                if (staleIds.length > 0) {
                    await tx.delete(teams).where(inArray(teams.id, staleIds))
                }
            })

            // Sync RBAC captain roles: grant for new captains, revoke for removed captains
            const newCaptainIds = new Set<string>(
                teamsToCreate
                    .flatMap((t) => [t.captainId, t.coach2Id ?? ""])
                    .filter((id): id is string => !!id && !isGhostCaptain(id))
            )

            for (const captainId of newCaptainIds) {
                if (!oldCaptainIds.has(captainId)) {
                    await grantRole(captainId, "captain", {
                        seasonId: config.seasonId,
                        divisionId,
                        grantedBy: callerId
                    })
                }
            }

            for (const captainId of oldCaptainIds) {
                if (!newCaptainIds.has(captainId)) {
                    await revokeRole(captainId, "captain", {
                        seasonId: config.seasonId,
                        divisionId
                    })
                }
            }

            const isUpdate = existingTeams.length > 0
            await logAuditEntry({
                userId: callerId,
                action: isUpdate ? "update" : "create",
                entityType: "teams",
                summary: `${isUpdate ? "Updated" : "Created"} teams for current season ${config.seasonId}, division ${divisionId}${isCoachesDiv ? " (coaches mode)" : ""}`
            })

            revalidatePath("/dashboard/select-captains")
            revalidateCalendarFeeds()
            return ok(
                undefined,
                `Successfully ${isUpdate ? "updated" : "created"} teams!`
            )
        } catch (error) {
            logger.error("Error saving teams", undefined, error)
            return fail("Something went wrong while saving teams.")
        }
    }
)
