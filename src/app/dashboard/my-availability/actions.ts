"use server"

import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { signups, userUnavailability } from "@/database/schema"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"

interface UpdateResult {
    status: boolean
    message: string
}

export async function updatePlayerAvailability(
    signupId: number,
    unavailableEventIds: number[]
): Promise<UpdateResult> {
    const session = await auth.api.getSession({
        headers: await headers()
    })
    if (!session) {
        return { status: false, message: "You need to be logged in." }
    }

    // Verify the signup belongs to the authenticated user
    const [signup] = await db
        .select({ id: signups.id, player: signups.player })
        .from(signups)
        .where(
            and(eq(signups.id, signupId), eq(signups.player, session.user.id))
        )
        .limit(1)

    if (!signup) {
        return {
            status: false,
            message: "Signup not found or does not belong to you."
        }
    }

    // Delete all existing unavailability rows for this user
    await db
        .delete(userUnavailability)
        .where(eq(userUnavailability.user_id, session.user.id))

    // Insert new unavailability rows
    if (unavailableEventIds.length > 0) {
        await db.insert(userUnavailability).values(
            unavailableEventIds.map((eventId) => ({
                user_id: session.user.id,
                signup_id: signupId,
                event_id: eventId
            }))
        )
    }

    return { status: true, message: "Your availability has been updated." }
}

// For refs who are not players — no signup_id, just user_id
export async function updateRefAvailability(
    unavailableEventIds: number[]
): Promise<UpdateResult> {
    const session = await auth.api.getSession({
        headers: await headers()
    })
    if (!session) {
        return { status: false, message: "You need to be logged in." }
    }

    // Delete all existing unavailability rows for this user
    await db
        .delete(userUnavailability)
        .where(eq(userUnavailability.user_id, session.user.id))

    // Insert new unavailability rows
    if (unavailableEventIds.length > 0) {
        await db.insert(userUnavailability).values(
            unavailableEventIds.map((eventId) => ({
                user_id: session.user.id,
                event_id: eventId
            }))
        )
    }

    return { status: true, message: "Your availability has been updated." }
}
