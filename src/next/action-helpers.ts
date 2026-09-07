import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import type { Permission } from "@/lib/permissions"
import { ActionError } from "@/lib/action-result"
import {
    hasCaptainPagesAccessBySession,
    hasPermissionBySession,
    isAdminOrDirectorBySession
} from "@/next/session"

// The result type and ok/fail/withAction/require* input helpers are
// framework-independent and live in src/lib/action-result.ts; they are
// re-exported here so server actions have a single import.
export * from "@/lib/action-result"

// ---------------------------------------------------------------------------
// Session and authorization guards for server actions. These read the
// ambient request (Next.js glue). They throw ActionError on failure so
// callers stay clean; withAction converts that into fail().
// ---------------------------------------------------------------------------

export async function requireSession() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        throw new ActionError("Not authenticated.")
    }
    return session
}

export async function requireAdmin(): Promise<void> {
    const allowed = await isAdminOrDirectorBySession()
    if (!allowed) throw new ActionError("Unauthorized.")
}

export async function requireCaptainAccess(): Promise<void> {
    const allowed = await hasCaptainPagesAccessBySession()
    if (!allowed) throw new ActionError("Unauthorized.")
}

export async function requirePermission(
    permission: Permission,
    context?: { seasonId?: number; divisionId?: number }
): Promise<void> {
    const allowed = await hasPermissionBySession(permission, context)
    if (!allowed) throw new ActionError("Unauthorized.")
}

/**
 * Passes when the caller holds ANY of the given permissions (checked in
 * order). Throws ActionError("Unauthorized.") when none match.
 */
export async function requireAnyPermission(
    permissions: Permission[],
    context?: { seasonId?: number; divisionId?: number }
): Promise<void> {
    for (const permission of permissions) {
        if (await hasPermissionBySession(permission, context)) return
    }
    throw new ActionError("Unauthorized.")
}
