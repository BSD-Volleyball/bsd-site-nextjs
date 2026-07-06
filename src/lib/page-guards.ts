import "server-only"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import {
    isAdminOrDirectorBySession,
    hasPermissionBySession,
    hasCaptainPagesAccessBySession
} from "@/lib/rbac"
import type { Permission } from "@/lib/permissions"

// ---------------------------------------------------------------------------
// Page-level guards — the redirect() counterparts of the throw-based helpers
// in action-helpers.ts. Use these in server page.tsx files; use the
// action-helpers versions inside server actions.
// ---------------------------------------------------------------------------

export async function requireSessionOrRedirect(to = "/auth/sign-in") {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        redirect(to)
    }
    return session
}

export async function requireAdminOrRedirect(to = "/dashboard") {
    const session = await requireSessionOrRedirect()
    const allowed = await isAdminOrDirectorBySession()
    if (!allowed) {
        redirect(to)
    }
    return session
}

export async function requireCaptainAccessOrRedirect(to = "/dashboard") {
    const session = await requireSessionOrRedirect()
    const allowed = await hasCaptainPagesAccessBySession()
    if (!allowed) {
        redirect(to)
    }
    return session
}

export async function requirePermissionOrRedirect(
    permission: Permission,
    context?: { seasonId?: number; divisionId?: number },
    to = "/dashboard"
) {
    const session = await requireSessionOrRedirect()
    const allowed = await hasPermissionBySession(permission, context)
    if (!allowed) {
        redirect(to)
    }
    return session
}
