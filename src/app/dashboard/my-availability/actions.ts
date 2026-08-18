"use server"

import { and, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { signups, userUnavailability } from "@/database/schema"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requirePositiveInt
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"
import {
    notifyAdminsOfTryoutRosterConflict,
    notifyCaptainsOfAvailabilityChange,
    resolveSeasonEvents
} from "@/lib/availability"
import { logAvailabilityChange } from "@/lib/availability-audit"
import { getSeasonConfig } from "@/lib/site-config"

export const updatePlayerAvailability = withAction(
    async (
        signupId: number,
        unavailableEventIds: number[]
    ): Promise<ActionResult> => {
        const session = await requireSession()
        requirePositiveInt(signupId, "signup")

        // Verify the signup belongs to the authenticated user
        const [signup] = await db
            .select({
                id: signups.id,
                player: signups.player,
                season: signups.season
            })
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

        const eventIds = [...new Set(unavailableEventIds)]
        const savedEvents = await resolveSeasonEvents(eventIds, signup.season)
        if (!savedEvents) {
            return fail(
                "Those dates are no longer part of this season. Reload the page and try again."
            )
        }

        // Snapshot before the destructive replace so the captain notification
        // can report an actual diff instead of "something changed".
        const previousRows = await db
            .select({ eventId: userUnavailability.event_id })
            .from(userUnavailability)
            .where(eq(userUnavailability.user_id, session.user.id))
        const previousIds = new Set(previousRows.map((r) => r.eventId))

        // Delete all existing unavailability rows for this user
        await db
            .delete(userUnavailability)
            .where(eq(userUnavailability.user_id, session.user.id))

        // Insert new unavailability rows
        if (eventIds.length > 0) {
            await db.insert(userUnavailability).values(
                eventIds.map((eventId) => ({
                    user_id: session.user.id,
                    signup_id: signupId,
                    event_id: eventId
                }))
            )
        }

        await logAvailabilityChange({
            userId: session.user.id,
            entityId: signupId,
            events: savedEvents
        })

        const nextIds = new Set(eventIds)
        const becameUnavailable = eventIds.filter((id) => !previousIds.has(id))
        const becameAvailable = [...previousIds].filter(
            (id) => !nextIds.has(id)
        )
        await notifyCaptainsOfAvailabilityChange(
            session.user.id,
            signup.season,
            becameUnavailable,
            becameAvailable
        )
        await notifyAdminsOfTryoutRosterConflict(
            session.user.id,
            signup.season,
            becameUnavailable
        )

        return ok(undefined, "Your availability has been updated.")
    }
)

// For refs who are not players — no signup_id, just user_id
export const updateRefAvailability = withAction(
    async (unavailableEventIds: number[]): Promise<ActionResult> => {
        const session = await requireSession()

        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return fail("There is no active season at this time.")
        }

        const eventIds = [...new Set(unavailableEventIds)]
        const savedEvents = await resolveSeasonEvents(eventIds, config.seasonId)
        if (!savedEvents) {
            return fail(
                "Those dates are no longer part of this season. Reload the page and try again."
            )
        }

        // Delete all existing unavailability rows for this user
        await db
            .delete(userUnavailability)
            .where(eq(userUnavailability.user_id, session.user.id))

        // Insert new unavailability rows
        if (eventIds.length > 0) {
            await db.insert(userUnavailability).values(
                eventIds.map((eventId) => ({
                    user_id: session.user.id,
                    event_id: eventId
                }))
            )
        }

        await logAvailabilityChange({
            userId: session.user.id,
            // No signup to point at — a ref's availability hangs off the user.
            entityId: session.user.id,
            events: savedEvents,
            context: "Ref availability"
        })

        return ok(undefined, "Your availability has been updated.")
    }
)
