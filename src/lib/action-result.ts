import { getSeasonConfig, type SeasonConfig } from "@/lib/site-config"
import { logger } from "@/lib/logger"

// ---------------------------------------------------------------------------
// Standardised action result type and helpers. Framework-independent: lib
// code and client components may import from here. The session/authorization
// guards that pair with these live in src/next/action-helpers.ts.
// ---------------------------------------------------------------------------

export type ActionResult<T = void> =
    | { status: true; data: T; message?: string }
    | { status: false; message: string }

export function ok(): ActionResult<void>
export function ok<T>(data: T, message?: string): ActionResult<T>
export function ok<T>(data?: T, message?: string): ActionResult<T> {
    return { status: true, data: data as T, message }
}

export function fail(message: string): ActionResult<never> {
    return { status: false, message }
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
 * and logging unexpected errors through the structured logger.
 *
 * Usage:
 *   export const myAction = withAction(async () => {
 *       await requireAdmin()
 *       const config = await requireSeasonConfig()
 *       // ... business logic ...
 *       return ok(data)
 *   })
 */
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
            logger.error("Unexpected action error", undefined, error)
            return fail("Something went wrong.")
        }
    }
}
