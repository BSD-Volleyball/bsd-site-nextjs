import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import type { Permission } from "@/lib/permissions"
import {
    hasCaptainPagesAccess,
    hasPermission,
    isAdminOrDirector,
    isCommissioner
} from "@/lib/rbac"

// ---------------------------------------------------------------------------
// Session-bound wrappers around the pure, userId-taking helpers in
// src/lib/rbac.ts. This is Next.js glue: everything here reads the ambient
// request through next/headers, which is why it lives outside src/lib.
// ---------------------------------------------------------------------------

export async function getSessionUserId(): Promise<string | null> {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user?.id ?? null
}

/**
 * Returns the authenticated session user, or null when unauthenticated.
 * Recognized by the authz regression checker as a session guard — use this
 * (with an early return on null) in actions that keep legacy response shapes
 * instead of a bare auth.api.getSession() fetch.
 */
export async function getSessionUser() {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user ?? null
}

export async function hasPermissionBySession(
    permission: Permission,
    context?: { seasonId?: number; divisionId?: number }
): Promise<boolean> {
    const userId = await getSessionUserId()
    if (!userId) return false
    return hasPermission(userId, permission, context)
}

export async function isAdminOrDirectorBySession(): Promise<boolean> {
    const userId = await getSessionUserId()
    if (!userId) return false
    return isAdminOrDirector(userId)
}

export async function isCommissionerBySession(): Promise<boolean> {
    const userId = await getSessionUserId()
    if (!userId) return false
    return isCommissioner(userId)
}

export async function hasCaptainPagesAccessBySession(): Promise<boolean> {
    const userId = await getSessionUserId()
    if (!userId) return false
    return hasCaptainPagesAccess(userId)
}
