"use server"

import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail, requirePositiveInt } from "@/next/action-helpers"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { seasons, divisions, users, userRoles } from "@/database/schema"
import { eq, desc, inArray, notInArray, and, isNotNull } from "drizzle-orm"

import { logAuditEntry } from "@/lib/audit-log"
import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"
import { formatPlayerName } from "@/lib/utils"

export interface Season {
    id: number
    code: string
    year: number
    season: string
}

export interface Division {
    id: number
    name: string
}

export interface User {
    id: string
    name: string
}

export interface CommissionerAssignment {
    divisionName: string
    divisionId: number
    commissioner1: string | null
    commissioner2: string | null
}

export const getSeasons = withAction(
    async (): Promise<ActionResult<Season[]>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const allSeasons = await db
                .select({
                    id: seasons.id,
                    code: seasons.code,
                    year: seasons.year,
                    season: seasons.season
                })
                .from(seasons)
                .orderBy(desc(seasons.year), desc(seasons.id))

            return ok(allSeasons)
        } catch (error) {
            console.error("Error fetching seasons:", error)
            return fail("Failed to load seasons.")
        }
    }
)

export const getCurrentSeason = withAction(
    async (): Promise<ActionResult<number | null>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const [currentSeason] = await db
                .select({ id: seasons.id })
                .from(seasons)
                .where(notInArray(seasons.phase, ["off_season", "complete"]))
                // Deterministic when more than one season exists: prefer the
                // newest in-progress season (matches the max-id "current season"
                // convention used elsewhere).
                .orderBy(desc(seasons.year), desc(seasons.id))
                .limit(1)

            if (currentSeason) {
                return ok(currentSeason.id)
            }

            // If no season has registration open, return the most recent season
            const [mostRecentSeason] = await db
                .select({ id: seasons.id })
                .from(seasons)
                .orderBy(desc(seasons.year), desc(seasons.id))
                .limit(1)

            return ok(mostRecentSeason?.id ?? null)
        } catch (error) {
            console.error("Error fetching current season:", error)
            return fail("Failed to load current season.")
        }
    }
)

export const getUsers = withAction(async (): Promise<ActionResult<User[]>> => {
    const hasAccess = await isAdminOrDirectorBySession()
    if (!hasAccess) {
        return fail("Unauthorized")
    }

    try {
        const allUsers = await db
            .select({
                id: users.id,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name
            })
            .from(users)
            .orderBy(users.last_name, users.first_name)

        const userList: User[] = allUsers.map((u) => ({
            id: u.id,
            name: formatPlayerName(u.first_name, u.last_name, u.preferred_name)
        }))

        return ok(userList)
    } catch (error) {
        console.error("Error fetching users:", error)
        return fail("Failed to load users.")
    }
})

export const getDivisions = withAction(
    async (): Promise<ActionResult<Division[]>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const divisionNames = ["AA", "A", "ABA", "ABB", "BBB", "BB"]
            const divisionsList = await db
                .select({
                    id: divisions.id,
                    name: divisions.name
                })
                .from(divisions)
                .where(inArray(divisions.name, divisionNames))

            // Sort by the order we want them displayed
            const sortedDivisions = divisionsList.sort((a, b) => {
                const aIndex = divisionNames.indexOf(a.name)
                const bIndex = divisionNames.indexOf(b.name)
                return aIndex - bIndex
            })

            return ok(sortedDivisions)
        } catch (error) {
            console.error("Error fetching divisions:", error)
            return fail("Failed to load divisions.")
        }
    }
)

export const getCommissionersForSeason = withAction(
    async (
        seasonId: number
    ): Promise<ActionResult<CommissionerAssignment[]>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        if (!Number.isInteger(seasonId) || seasonId <= 0) {
            return fail("Invalid season.")
        }

        try {
            // Get the divisions first
            const divisionsResult = await getDivisions()
            if (!divisionsResult.status) {
                return fail(divisionsResult.message)
            }

            // Get all division-scoped commissioners for this season
            const seasonCommissioners = await db
                .select({
                    divisionId: userRoles.division_id,
                    commissionerId: userRoles.user_id
                })
                .from(userRoles)
                .where(
                    and(
                        eq(userRoles.role, "commissioner"),
                        eq(userRoles.season_id, seasonId),
                        isNotNull(userRoles.division_id)
                    )
                )

            // Build assignments for each division
            const assignments: CommissionerAssignment[] =
                divisionsResult.data.map((div) => {
                    const divCommissioners = seasonCommissioners.filter(
                        (c) => c.divisionId === div.id
                    )
                    return {
                        divisionName: div.name,
                        divisionId: div.id,
                        commissioner1:
                            divCommissioners[0]?.commissionerId ?? null,
                        commissioner2:
                            divCommissioners[1]?.commissionerId ?? null
                    }
                })

            return ok(assignments)
        } catch (error) {
            console.error("Error fetching commissioners for season:", error)
            return fail("Failed to load commissioners.")
        }
    }
)

export const saveCommissioners = withAction(
    async (data: {
        seasonId: number
        assignments: Array<{
            divisionId: number
            divisionName: string
            commissioner1: string | null
            commissioner2: string | null
        }>
    }): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        requirePositiveInt(data.seasonId, "season ID")

        try {
            // Replace this season's division-scoped commissioner roles.
            // League-wide commissioner rows (division_id IS NULL) are managed via
            // /dashboard/manage-roles and deliberately left untouched here.
            await db
                .delete(userRoles)
                .where(
                    and(
                        eq(userRoles.role, "commissioner"),
                        eq(userRoles.season_id, data.seasonId),
                        isNotNull(userRoles.division_id)
                    )
                )

            const userRoleValues: Array<{
                user_id: string
                role: string
                season_id: number
                division_id: number
            }> = []

            for (const assignment of data.assignments) {
                if (assignment.commissioner1) {
                    userRoleValues.push({
                        user_id: assignment.commissioner1,
                        role: "commissioner",
                        season_id: data.seasonId,
                        division_id: assignment.divisionId
                    })
                }
                if (assignment.commissioner2) {
                    userRoleValues.push({
                        user_id: assignment.commissioner2,
                        role: "commissioner",
                        season_id: data.seasonId,
                        division_id: assignment.divisionId
                    })
                }
            }

            if (userRoleValues.length > 0) {
                await db.insert(userRoles).values(userRoleValues)
            }

            // Log the action
            const sessionUserId = await getSessionUserId()
            if (sessionUserId) {
                await logAuditEntry({
                    userId: sessionUserId,
                    action: "update",
                    entityType: "commissioners",
                    summary: `Updated commissioners for season ${data.seasonId}`
                })
            }

            revalidatePath("/dashboard/select-commissioners")
            return ok(undefined, "Commissioners updated successfully.")
        } catch (error) {
            console.error("Error saving commissioners:", error)
            return fail("Failed to save commissioners.")
        }
    }
)
