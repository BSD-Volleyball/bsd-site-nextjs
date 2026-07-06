"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { withAction, ok, fail } from "@/lib/action-helpers"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { seasons, divisions, users, userRoles } from "@/database/schema"
import { eq, desc, inArray, notInArray, and, isNotNull } from "drizzle-orm"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { logAuditEntry } from "@/lib/audit-log"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

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

export async function getSeasons(): Promise<{
    status: boolean
    message?: string
    seasons: Season[]
}> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized", seasons: [] }
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

        return { status: true, seasons: allSeasons }
    } catch (error) {
        console.error("Error fetching seasons:", error)
        return {
            status: false,
            message: "Failed to load seasons.",
            seasons: []
        }
    }
}

export async function getCurrentSeason(): Promise<{
    status: boolean
    seasonId: number | null
}> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return { status: false, seasonId: null }
    }

    try {
        const [currentSeason] = await db
            .select({ id: seasons.id })
            .from(seasons)
            .where(notInArray(seasons.phase, ["off_season", "complete"]))
            .limit(1)

        if (currentSeason) {
            return { status: true, seasonId: currentSeason.id }
        }

        // If no season has registration open, return the most recent season
        const [mostRecentSeason] = await db
            .select({ id: seasons.id })
            .from(seasons)
            .orderBy(desc(seasons.year), desc(seasons.id))
            .limit(1)

        return { status: true, seasonId: mostRecentSeason?.id ?? null }
    } catch (error) {
        console.error("Error fetching current season:", error)
        return { status: false, seasonId: null }
    }
}

export async function getUsers(): Promise<{
    status: boolean
    message?: string
    users: User[]
}> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized", users: [] }
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

        const userList: User[] = allUsers.map((u) => {
            const preferredPart = u.preferred_name
                ? ` (${u.preferred_name})`
                : ""
            return {
                id: u.id,
                name: `${u.first_name}${preferredPart} ${u.last_name}`
            }
        })

        return { status: true, users: userList }
    } catch (error) {
        console.error("Error fetching users:", error)
        return {
            status: false,
            message: "Failed to load users.",
            users: []
        }
    }
}

export async function getDivisions(): Promise<{
    status: boolean
    message?: string
    divisions: Division[]
}> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized", divisions: [] }
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

        return { status: true, divisions: sortedDivisions }
    } catch (error) {
        console.error("Error fetching divisions:", error)
        return {
            status: false,
            message: "Failed to load divisions.",
            divisions: []
        }
    }
}

export async function getCommissionersForSeason(seasonId: number): Promise<{
    status: boolean
    message?: string
    assignments: CommissionerAssignment[]
}> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized", assignments: [] }
    }

    try {
        // Get the divisions first
        const divisionsResult = await getDivisions()
        if (!divisionsResult.status) {
            return {
                status: false,
                message: divisionsResult.message,
                assignments: []
            }
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
            divisionsResult.divisions.map((div) => {
                const divCommissioners = seasonCommissioners.filter(
                    (c) => c.divisionId === div.id
                )
                return {
                    divisionName: div.name,
                    divisionId: div.id,
                    commissioner1: divCommissioners[0]?.commissionerId ?? null,
                    commissioner2: divCommissioners[1]?.commissionerId ?? null
                }
            })

        return { status: true, assignments }
    } catch (error) {
        console.error("Error fetching commissioners for season:", error)
        return {
            status: false,
            message: "Failed to load commissioners.",
            assignments: []
        }
    }
}

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
        const hasAccess = await getIsAdminOrDirector()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

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
            const session = await auth.api.getSession({
                headers: await headers()
            })
            if (session) {
                await logAuditEntry({
                    userId: session.user.id,
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
