/**
 * calendar-token.ts — per-user secret behind the iCalendar subscription
 * feeds. The token is the whole credential (calendar apps fetch with no
 * session), so it is 32 random bytes, stored in its own table, and
 * rotatable from the UI. Lookups are by unique index; callers validate the
 * token's shape before querying.
 */

import "server-only"

import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import { calendarTokens } from "@/database/schema"

export function generateCalendarToken(): string {
    return randomBytes(32).toString("base64url")
}

/** Returns the user's feed token, creating one on first use (race-safe). */
export async function getOrCreateCalendarToken(userId: string): Promise<string> {
    const [existing] = await db
        .select({ token: calendarTokens.token })
        .from(calendarTokens)
        .where(eq(calendarTokens.user_id, userId))
        .limit(1)
    if (existing) return existing.token

    await db
        .insert(calendarTokens)
        .values({ user_id: userId, token: generateCalendarToken() })
        .onConflictDoNothing({ target: calendarTokens.user_id })

    const [row] = await db
        .select({ token: calendarTokens.token })
        .from(calendarTokens)
        .where(eq(calendarTokens.user_id, userId))
        .limit(1)
    if (!row) throw new Error("Failed to create calendar token")
    return row.token
}

/** Replaces the user's token; previously issued feed URLs stop resolving. */
export async function rotateCalendarToken(userId: string): Promise<string> {
    const token = generateCalendarToken()
    const [row] = await db
        .insert(calendarTokens)
        .values({ user_id: userId, token })
        .onConflictDoUpdate({
            target: calendarTokens.user_id,
            set: { token, rotated_at: new Date() }
        })
        .returning({ token: calendarTokens.token })
    return row.token
}

export async function findUserIdByCalendarToken(
    token: string
): Promise<string | null> {
    const [row] = await db
        .select({ userId: calendarTokens.user_id })
        .from(calendarTokens)
        .where(eq(calendarTokens.token, token))
        .limit(1)
    return row?.userId ?? null
}
