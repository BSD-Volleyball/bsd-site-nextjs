"use server"

import { db } from "@/database/db"
import { seasons, divisions, commissioners, users } from "@/database/schema"
import { eq, desc, inArray } from "drizzle-orm"
import { checkAdminAccess } from "@/lib/auth-checks"
import { logAuditEntry } from "@/lib/audit-log"
import { getCurrentSession } from "@/lib/auth-checks"

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
    const hasAccess = await checkAdminAccess()
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
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, seasonId: null }
    }

    try {
        const [currentSeason] = await db
            .select({ id: seasons.id })
            .from(seasons)
            .where(eq(seasons.registration_open, true))
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
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized", users: [] }
    }

    try {
        const allUsers = await db
            .select({
                id: users.id,
                first_name: users.first_name,
                last_name: users.last_name,
                preffered_name: users.preffered_name
            })
            .from(users)
            .orderBy(users.last_name, users.first_name)

        const userList: User[] = allUsers.map((u) => {
            const preferredPart = u.preffered_name
                ? ` (${u.preffered_name})`
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
    const hasAccess = await checkAdminAccess()
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
    const hasAccess = await checkAdminAccess()
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

        // Get all commissioners for this season
        const seasonCommissioners = await db
            .select({
                divisionId: commissioners.division,
                commissionerId: commissioners.commissioner
            })
            .from(commissioners)
            .where(eq(commissioners.season, seasonId))

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

export async function saveCommissioners(data: {
    seasonId: number
    assignments: Array<{
        divisionId: number
        divisionName: string
        commissioner1: string | null
        commissioner2: string | null
    }>
}): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        // Delete existing commissioners for this season
        await db
            .delete(commissioners)
            .where(eq(commissioners.season, data.seasonId))

        // Insert new commissioner assignments
        const insertValues: Array<{
            season: number
            division: number
            commissioner: string
        }> = []

        for (const assignment of data.assignments) {
            if (assignment.commissioner1) {
                insertValues.push({
                    season: data.seasonId,
                    division: assignment.divisionId,
                    commissioner: assignment.commissioner1
                })
            }
            if (assignment.commissioner2) {
                insertValues.push({
                    season: data.seasonId,
                    division: assignment.divisionId,
                    commissioner: assignment.commissioner2
                })
            }
        }

        if (insertValues.length > 0) {
            await db.insert(commissioners).values(insertValues)
        }

        // Log the action
        const session = await getCurrentSession()
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "commissioners",
                summary: `Updated commissioners for season ${data.seasonId}`
            })
        }

        return { status: true, message: "Commissioners updated successfully." }
    } catch (error) {
        console.error("Error saving commissioners:", error)
        return { status: false, message: "Failed to save commissioners." }
    }
}
