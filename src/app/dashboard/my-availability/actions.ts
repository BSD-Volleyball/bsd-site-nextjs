"use server"

import { db } from "@/database/db"
import { signups, userUnavailability } from "@/database/schema"
import { eq, and } from "drizzle-orm"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requirePositiveInt
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"

export const updatePlayerAvailability = withAction(
    async (
        signupId: number,
        unavailableEventIds: number[]
    ): Promise<ActionResult> => {
        const session = await requireSession()
        requirePositiveInt(signupId, "signup")

        // Verify the signup belongs to the authenticated user
        const [signup] = await db
            .select({ id: signups.id, player: signups.player })
            .from(signups)
            .where(
                and(
                    eq(signups.id, signupId),
                    eq(signups.player, session.user.id)
                )
            )
            .limit(1)

        if (!signup) {
            return fail("Signup not found or does not belong to you.")
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

        return ok(undefined, "Your availability has been updated.")
    }
)

// For refs who are not players — no signup_id, just user_id
export const updateRefAvailability = withAction(
    async (unavailableEventIds: number[]): Promise<ActionResult> => {
        const session = await requireSession()

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

        return ok(undefined, "Your availability has been updated.")
    }
)
