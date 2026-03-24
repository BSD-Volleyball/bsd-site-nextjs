"use server"

import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getSeasonConfig, type SeasonConfig } from "@/lib/site-config"
import {
    isAdminOrDirectorBySession,
    isCommissionerBySession,
    hasCaptainPagesAccessBySession,
    hasPermissionBySession
} from "@/lib/rbac"
import type { Permission } from "@/lib/permissions"

// ---------------------------------------------------------------------------
// Standardised server-action result type
// ---------------------------------------------------------------------------

export type ActionResult<T = void> =
    | { status: true; data: T }
    | { status: false; message: string }

export function ok(): ActionResult<void>
export function ok<T>(data: T): ActionResult<T>
export function ok<T>(data?: T): ActionResult<T> {
    return { status: true, data: data as T }
}

export function fail(message: string): ActionResult<never> {
    return { status: false, message }
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

export async function requireSession() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        throw new ActionError("Not authenticated.")
    }
    return session
}

export async function getOptionalSession() {
    return auth.api.getSession({ headers: await headers() })
}

// ---------------------------------------------------------------------------
// Authorization helpers — throw on failure so callers stay clean
// ---------------------------------------------------------------------------

export async function requireAdmin(): Promise<void> {
    const allowed = await isAdminOrDirectorBySession()
    if (!allowed) throw new ActionError("Unauthorized.")
}

export async function requireCommissioner(): Promise<void> {
    const allowed = await isCommissionerBySession()
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

// ---------------------------------------------------------------------------
// Season config helpers
// ---------------------------------------------------------------------------

export async function requireSeasonConfig(): Promise<
    SeasonConfig & { seasonId: number }
> {
    const config = await getSeasonConfig()
    if (!config.seasonId) {
        throw new ActionError("No current season found.")
    }
    return config as SeasonConfig & { seasonId: number }
}

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

export function requirePositiveInt(value: unknown, label = "ID"): number {
    const n = typeof value === "number" ? value : Number(value)
    if (!Number.isInteger(n) || n <= 0) {
        throw new ActionError(`Invalid ${label}.`)
    }
    return n
}

export function requireNonEmptyString(value: unknown, label = "value"): string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ActionError(`${label} is required.`)
    }
    return value.trim()
}

// ---------------------------------------------------------------------------
// ActionError — a typed error class used by the helpers above.
// Callers can catch it and return fail() or let withAction handle it.
// ---------------------------------------------------------------------------

export class ActionError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "ActionError"
    }
}

/**
 * Wraps an async server action body, converting ActionError into fail()
 * and logging unexpected errors to console.
 *
 * Usage:
 *   export const myAction = withAction(async () => {
 *       await requireAdmin()
 *       const config = await requireSeasonConfig()
 *       // ... business logic ...
 *       return ok(data)
 *   })
 */
export function withAction<T>(
    fn: () => Promise<ActionResult<T>>
): () => Promise<ActionResult<T>>
export function withAction<T, A extends unknown[]>(
    fn: (...args: A) => Promise<ActionResult<T>>
): (...args: A) => Promise<ActionResult<T>>
export function withAction<T, A extends unknown[]>(
    fn: (...args: A) => Promise<ActionResult<T>>
): (...args: A) => Promise<ActionResult<T>> {
    return async (...args: A) => {
        try {
            return await fn(...args)
        } catch (error) {
            if (error instanceof ActionError) {
                return fail(error.message)
            }
            console.error("Unexpected action error:", error)
            return fail("Something went wrong.")
        }
    }
}
