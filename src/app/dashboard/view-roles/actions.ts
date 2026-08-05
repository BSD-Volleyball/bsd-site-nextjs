"use server"

import { db } from "@/database/db"
import { userRoles, users, seasons, divisions } from "@/database/schema"
import { eq } from "drizzle-orm"
import { isValidRole } from "@/lib/permissions"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { formatPlayerName } from "@/lib/utils"

export interface RoleHolder {
    assignment_id: number
    user_id: string
    name: string
    email: string | null
    season_id: number | null
    season_label: string | null
    division_label: string | null
    granted_at: Date
}

/**
 * All users holding the given role, with season/division scope labels.
 * Admin-only; returns [] for other callers and for unknown role strings.
 */
export async function getUsersWithRole(role: string): Promise<RoleHolder[]> {
    if (!(await isAdminOrDirectorBySession())) return []
    if (typeof role !== "string" || !isValidRole(role)) return []

    const rows = await db
        .select({
            assignment_id: userRoles.id,
            user_id: users.id,
            first_name: users.first_name,
            last_name: users.last_name,
            preferred_name: users.preferred_name,
            email: users.email,
            season_id: userRoles.season_id,
            season_code: seasons.code,
            season_year: seasons.year,
            season_season: seasons.season,
            division_name: divisions.name,
            granted_at: userRoles.granted_at
        })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.user_id, users.id))
        .leftJoin(seasons, eq(userRoles.season_id, seasons.id))
        .leftJoin(divisions, eq(userRoles.division_id, divisions.id))
        .where(eq(userRoles.role, role))
        .orderBy(users.last_name, users.first_name)

    return rows.map((r) => ({
        assignment_id: r.assignment_id,
        user_id: r.user_id,
        name: formatPlayerName(r.first_name, r.last_name, r.preferred_name),
        email: r.email,
        season_id: r.season_id,
        season_label: r.season_code
            ? `${r.season_code} ${r.season_year} ${r.season_season}`
            : null,
        division_label: r.division_name ?? null,
        granted_at: r.granted_at
    }))
}
