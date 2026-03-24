"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { seasons, divisions, userRoles, users } from "@/database/schema"
import { desc, eq, asc } from "drizzle-orm"
import {
    isAdminOrDirectorBySession,
    grantRole,
    invalidateAllSessionsForUser
} from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import type { Role } from "@/lib/permissions"

export interface UserRoleAssignment {
    id: number
    role: string
    season_id: number | null
    division_id: number | null
    season_label: string | null
    division_label: string | null
    granted_at: Date
    granted_by_name: string | null
}

export interface SeasonOption {
    id: number
    label: string
}

export interface DivisionOption {
    id: number
    name: string
}

export interface UserSearchResult {
    id: string
    first_name: string
    last_name: string
    email: string
}

export async function getSeasonOptions(): Promise<SeasonOption[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    const rows = await db
        .select({
            id: seasons.id,
            code: seasons.code,
            year: seasons.year,
            season: seasons.season
        })
        .from(seasons)
        .orderBy(desc(seasons.id))

    return rows.map((s) => ({
        id: s.id,
        label: `${s.code} ${s.year} ${s.season}`
    }))
}

export async function getDivisionOptions(): Promise<DivisionOption[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    return db
        .select({ id: divisions.id, name: divisions.name })
        .from(divisions)
        .orderBy(asc(divisions.name))
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    if (!query || query.trim().length < 2) return []

    const allUsers = await db
        .select({
            id: users.id,
            first_name: users.first_name,
            last_name: users.last_name,
            email: users.email
        })
        .from(users)

    const q = query.toLowerCase()
    return allUsers
        .filter(
            (u) =>
                u.first_name.toLowerCase().includes(q) ||
                u.last_name.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
        )
        .slice(0, 20)
}

export async function getUserRoleAssignments(
    userId: string
): Promise<UserRoleAssignment[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    const rows = await db
        .select({
            id: userRoles.id,
            role: userRoles.role,
            season_id: userRoles.season_id,
            division_id: userRoles.division_id,
            granted_at: userRoles.granted_at,
            granted_by: userRoles.granted_by,
            season_code: seasons.code,
            season_year: seasons.year,
            season_season: seasons.season,
            division_name: divisions.name
        })
        .from(userRoles)
        .leftJoin(seasons, eq(userRoles.season_id, seasons.id))
        .leftJoin(divisions, eq(userRoles.division_id, divisions.id))
        .where(eq(userRoles.user_id, userId))

    // Load granted_by names separately to avoid complex join
    const grantedByIds = [
        ...new Set(rows.map((r) => r.granted_by).filter(Boolean))
    ] as string[]
    const granterNames: Record<string, string> = {}
    if (grantedByIds.length > 0) {
        const granters = await db
            .select({
                id: users.id,
                first_name: users.first_name,
                last_name: users.last_name
            })
            .from(users)
        for (const g of granters) {
            if (grantedByIds.includes(g.id)) {
                granterNames[g.id] = `${g.first_name} ${g.last_name}`
            }
        }
    }

    return rows.map((r) => ({
        id: r.id,
        role: r.role,
        season_id: r.season_id,
        division_id: r.division_id,
        season_label: r.season_code
            ? `${r.season_code} ${r.season_year} ${r.season_season}`
            : null,
        division_label: r.division_name ?? null,
        granted_at: r.granted_at,
        granted_by_name: r.granted_by
            ? (granterNames[r.granted_by] ?? null)
            : null
    }))
}

export async function addUserRole(data: {
    userId: string
    role: Role
    seasonId?: number
    divisionId?: number
}): Promise<{ status: boolean; message: string }> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return { status: false, message: "Unauthorized" }

    try {
        const session = await auth.api.getSession({ headers: await headers() })
        await grantRole(data.userId, data.role, {
            seasonId: data.seasonId,
            divisionId: data.divisionId,
            grantedBy: session?.user?.id
        })

        await logAuditEntry({
            userId: session?.user?.id ?? "unknown",
            action: "create",
            entityType: "user_roles",
            entityId: data.userId,
            summary: `Granted role "${data.role}" to user ${data.userId}${data.seasonId ? ` for season ${data.seasonId}` : ""}${data.divisionId ? `, division ${data.divisionId}` : ""}`
        })

        revalidatePath("/dashboard/manage-roles")
        return { status: true, message: "Role granted successfully." }
    } catch (error) {
        console.error("Error granting role:", error)
        return { status: false, message: "Failed to grant role." }
    }
}

export async function removeUserRole(data: {
    userId: string
    roleRowId: number
    role: Role
    seasonId?: number
    divisionId?: number
}): Promise<{ status: boolean; message: string }> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return { status: false, message: "Unauthorized" }

    try {
        // Delete by row ID for precision
        await db.delete(userRoles).where(eq(userRoles.id, data.roleRowId))

        const session = await auth.api.getSession({ headers: await headers() })
        await logAuditEntry({
            userId: session?.user?.id ?? "unknown",
            action: "delete",
            entityType: "user_roles",
            entityId: data.userId,
            summary: `Revoked role "${data.role}" from user ${data.userId}${data.seasonId ? ` for season ${data.seasonId}` : ""}${data.divisionId ? `, division ${data.divisionId}` : ""}`
        })

        // Invalidate sessions if an admin role was removed
        if (data.role === "admin") {
            await invalidateAllSessionsForUser(data.userId)
        }

        revalidatePath("/dashboard/manage-roles")
        return { status: true, message: "Role removed successfully." }
    } catch (error) {
        console.error("Error removing role:", error)
        return { status: false, message: "Failed to remove role." }
    }
}
