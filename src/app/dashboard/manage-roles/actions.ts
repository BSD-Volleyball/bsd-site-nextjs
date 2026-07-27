"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { withAction, ok, fail, requirePositiveInt } from "@/lib/action-helpers"
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
import { isValidRole, type Role } from "@/lib/permissions"

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

export const addUserRole = withAction(
    async (data: {
        userId: string
        role: Role
        seasonId?: number
        divisionId?: number
    }): Promise<ActionResult> => {
        const isAdmin = await isAdminOrDirectorBySession()
        if (!isAdmin) return fail("Unauthorized")

        // `data.role` is typed as Role but arrives over the network — a
        // crafted request can send any string into user_roles.
        if (!isValidRole(data.role)) return fail("Invalid role.")
        const seasonId =
            data.seasonId != null
                ? requirePositiveInt(data.seasonId, "season ID")
                : undefined
        const divisionId =
            data.divisionId != null
                ? requirePositiveInt(data.divisionId, "division ID")
                : undefined

        const session = await auth.api.getSession({
            headers: await headers()
        })
        await grantRole(data.userId, data.role, {
            seasonId,
            divisionId,
            grantedBy: session?.user?.id
        })

        await logAuditEntry({
            userId: session?.user?.id ?? "unknown",
            action: "create",
            entityType: "user_roles",
            entityId: data.userId,
            summary: `Granted role "${data.role}" to user ${data.userId}${seasonId ? ` for season ${seasonId}` : ""}${divisionId ? `, division ${divisionId}` : ""}`
        })

        revalidatePath("/dashboard/manage-roles")
        return ok(undefined, "Role granted successfully.")
    }
)

export const removeUserRole = withAction(
    async (data: {
        userId: string
        roleRowId: number
    }): Promise<ActionResult> => {
        const isAdmin = await isAdminOrDirectorBySession()
        if (!isAdmin) return fail("Unauthorized")

        const roleRowId = requirePositiveInt(data.roleRowId, "role row ID")

        // Load the row first: the audit entry must reflect what was actually
        // deleted (not client-supplied labels), and the row must belong to
        // the user named in the request.
        const [row] = await db
            .select({
                user_id: userRoles.user_id,
                role: userRoles.role,
                season_id: userRoles.season_id,
                division_id: userRoles.division_id
            })
            .from(userRoles)
            .where(eq(userRoles.id, roleRowId))
            .limit(1)

        if (!row) return fail("Role assignment not found.")
        if (row.user_id !== data.userId) {
            return fail("Role assignment does not belong to that user.")
        }

        await db.delete(userRoles).where(eq(userRoles.id, roleRowId))

        const session = await auth.api.getSession({
            headers: await headers()
        })
        await logAuditEntry({
            userId: session?.user?.id ?? "unknown",
            action: "delete",
            entityType: "user_roles",
            entityId: row.user_id,
            summary: `Revoked role "${row.role}" from user ${row.user_id}${row.season_id ? ` for season ${row.season_id}` : ""}${row.division_id ? `, division ${row.division_id}` : ""}`
        })

        // Any revoke through this admin action reduces privilege, so force a
        // fresh login rather than letting the elevated session ride out its
        // natural expiry (AGENTS.md security rule; previously admin-only).
        await invalidateAllSessionsForUser(row.user_id)

        revalidatePath("/dashboard/manage-roles")
        return ok(undefined, "Role removed successfully.")
    }
)
