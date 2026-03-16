import { and, eq, isNull } from "drizzle-orm"
import { cache } from "react"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import {
    commissioners,
    sessions,
    teams,
    userRoles,
    users
} from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import { type Permission, type Role, ROLE_PERMISSIONS } from "@/lib/permissions"

export async function getSessionUserId(): Promise<string | null> {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user?.id ?? null
}

// ---------------------------------------------------------------------------
// Core: load all role assignments for a user (cached per request)
// ---------------------------------------------------------------------------

type UserRoleRow = {
    role: string
    season_id: number | null
    division_id: number | null
}

// cache() memoizes per React request — avoids repeated DB hits when multiple
// permission checks fire within the same server action or page render.
const getUserRoleRows = cache(
    async (userId: string): Promise<UserRoleRow[]> => {
        return db
            .select({
                role: userRoles.role,
                season_id: userRoles.season_id,
                division_id: userRoles.division_id
            })
            .from(userRoles)
            .where(eq(userRoles.user_id, userId))
    }
)

// ---------------------------------------------------------------------------
// Core: permission check
// ---------------------------------------------------------------------------

/**
 * Returns true if the user holds any role that grants the requested permission.
 *
 * context.seasonId — when provided, role rows must match this season (or be global).
 * context.divisionId — when provided, role rows must be league-wide (division_id IS NULL)
 *                      OR match this specific division.
 */
export async function hasPermission(
    userId: string,
    permission: Permission,
    context?: { seasonId?: number; divisionId?: number }
): Promise<boolean> {
    const rows = await getUserRoleRows(userId)

    for (const row of rows) {
        // Season filter: global roles (season_id = null) always match;
        // season-bound roles only match the requested season.
        if (context?.seasonId !== undefined && row.season_id !== null) {
            if (row.season_id !== context.seasonId) continue
        }

        // Division filter: league-wide roles (division_id = null) always match;
        // division-bound roles only match the requested division.
        if (context?.divisionId !== undefined && row.division_id !== null) {
            if (row.division_id !== context.divisionId) continue
        }

        const role = row.role as Role
        const perms = ROLE_PERMISSIONS[role]
        if (perms?.includes(permission)) return true
    }

    // Fall back to legacy users.role column during transition (admin/director).
    // This ensures the system works even before user_roles is fully populated.
    const legacyRole = await getLegacyRole(userId)
    if (legacyRole === "admin" || legacyRole === "director") return true

    return false
}

export async function hasPermissionBySession(
    permission: Permission,
    context?: { seasonId?: number; divisionId?: number }
): Promise<boolean> {
    const userId = await getSessionUserId()
    if (!userId) return false
    return hasPermission(userId, permission, context)
}

// ---------------------------------------------------------------------------
// Legacy fallback: read users.role column during transition
// ---------------------------------------------------------------------------

const getLegacyRole = cache(async (userId: string): Promise<string | null> => {
    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    return user?.role ?? null
})

// ---------------------------------------------------------------------------
// Backward-compatible helpers (signatures unchanged — zero action changes needed)
// ---------------------------------------------------------------------------

export async function isAdminOrDirector(userId: string): Promise<boolean> {
    return hasPermission(userId, "season:control")
}

export async function isAdminOrDirectorBySession(): Promise<boolean> {
    return hasPermissionBySession("season:control")
}

export async function isCommissionerForSeason(
    userId: string,
    seasonId: number
): Promise<boolean> {
    // Check user_roles for an explicit commissioner role for this season
    const rows = await getUserRoleRows(userId)
    if (
        rows.some((r) => r.role === "commissioner" && r.season_id === seasonId)
    ) {
        return true
    }

    // Fall back to legacy commissioners table during transition
    const [record] = await db
        .select({ id: commissioners.id })
        .from(commissioners)
        .where(
            and(
                eq(commissioners.season, seasonId),
                eq(commissioners.commissioner, userId)
            )
        )
        .limit(1)

    return !!record
}

export async function isCommissionerForCurrentSeason(
    userId: string
): Promise<boolean> {
    const config = await getSeasonConfig()
    if (!config.seasonId) return false
    return isCommissionerForSeason(userId, config.seasonId)
}

export async function isCaptainForSeason(
    userId: string,
    seasonId: number
): Promise<boolean> {
    // Check user_roles first (new system)
    const rows = await getUserRoleRows(userId)
    const hasCaptainRole = rows.some(
        (r) => r.role === "captain" && r.season_id === seasonId
    )
    if (hasCaptainRole) return true

    // Fall back to legacy teams table lookup during transition
    const [captainRecord] = await db
        .select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.season, seasonId), eq(teams.captain, userId)))
        .limit(1)

    return !!captainRecord
}

export async function isCommissionerBySession(): Promise<boolean> {
    const userId = await getSessionUserId()
    if (!userId) return false

    // Admins are implicitly commissioners
    if (await isAdminOrDirector(userId)) return true

    const config = await getSeasonConfig()
    if (!config.seasonId) return false
    return isCommissionerForSeason(userId, config.seasonId)
}

export async function hasAdministrativeAccessBySession(): Promise<boolean> {
    return hasCaptainPagesAccessBySession()
}

export async function hasCaptainPagesAccessBySession(): Promise<boolean> {
    const config = await getSeasonConfig()
    if (!config.seasonId) return false
    return hasPermissionBySession("signups:view", { seasonId: config.seasonId })
}

export async function hasViewSignupsAccessBySession(): Promise<boolean> {
    return hasCaptainPagesAccessBySession()
}

// ---------------------------------------------------------------------------
// Commissioner division scoping
// ---------------------------------------------------------------------------

export type CommissionerDivisionAccess =
    | { type: "league_wide" }
    | { type: "division_specific"; divisionId: number }
    | { type: "denied" }

/**
 * Returns the division scope for a commissioner in a given season.
 * Admins/directors are always league-wide. Division-specific commissioners
 * are scoped to their one division. Falls back to the legacy commissioners
 * table if no user_roles row is found.
 */
export async function getCommissionerDivisionAccess(
    userId: string,
    seasonId: number
): Promise<CommissionerDivisionAccess> {
    if (await isAdminOrDirector(userId)) {
        return { type: "league_wide" }
    }

    const roleRows = await db
        .select({ divisionId: userRoles.division_id })
        .from(userRoles)
        .where(
            and(
                eq(userRoles.user_id, userId),
                eq(userRoles.role, "commissioner"),
                eq(userRoles.season_id, seasonId)
            )
        )

    if (roleRows.length > 0) {
        const hasLeagueWide = roleRows.some((r) => r.divisionId === null)
        if (hasLeagueWide) return { type: "league_wide" }
        return {
            type: "division_specific",
            divisionId: roleRows[0].divisionId!
        }
    }

    const [legacyRow] = await db
        .select({ divisionId: commissioners.division })
        .from(commissioners)
        .where(
            and(
                eq(commissioners.season, seasonId),
                eq(commissioners.commissioner, userId)
            )
        )
        .limit(1)

    if (legacyRow) {
        return { type: "division_specific", divisionId: legacyRow.divisionId }
    }

    return { type: "denied" }
}

// ---------------------------------------------------------------------------
// Role assignment helpers (used by manage-roles and dual-write actions)
// ---------------------------------------------------------------------------

export async function grantRole(
    userId: string,
    role: Role,
    options?: {
        seasonId?: number
        divisionId?: number
        grantedBy?: string
    }
): Promise<void> {
    // Avoid duplicates: check if the row already exists
    const conditions = [
        eq(userRoles.user_id, userId),
        eq(userRoles.role, role),
        options?.seasonId !== undefined
            ? eq(userRoles.season_id, options.seasonId)
            : isNull(userRoles.season_id),
        options?.divisionId !== undefined
            ? eq(userRoles.division_id, options.divisionId)
            : isNull(userRoles.division_id)
    ]

    const [existing] = await db
        .select({ id: userRoles.id })
        .from(userRoles)
        .where(and(...conditions))
        .limit(1)

    if (existing) return

    await db.insert(userRoles).values({
        user_id: userId,
        role,
        season_id: options?.seasonId ?? null,
        division_id: options?.divisionId ?? null,
        granted_by: options?.grantedBy ?? null
    })
}

export async function revokeRole(
    userId: string,
    role: Role,
    options?: { seasonId?: number; divisionId?: number }
): Promise<void> {
    const conditions = [
        eq(userRoles.user_id, userId),
        eq(userRoles.role, role),
        options?.seasonId !== undefined
            ? eq(userRoles.season_id, options.seasonId)
            : isNull(userRoles.season_id),
        options?.divisionId !== undefined
            ? eq(userRoles.division_id, options.divisionId)
            : isNull(userRoles.division_id)
    ]

    await db.delete(userRoles).where(and(...conditions))
}

export async function getUserRolesForUser(
    userId: string
): Promise<UserRoleRow[]> {
    return getUserRoleRows(userId)
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export async function invalidateAllSessionsForUser(
    userId: string
): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId))
}
