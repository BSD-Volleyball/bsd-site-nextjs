"use server"

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import { seasonEvents, signups, userUnavailability } from "@/database/schema"
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
    resolveSeasonEvents,
    selectUnavailableEventIds
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
        // can report an actual diff instead of "something changed". Season-
        // scoped: an unscoped read once diffed against a leftover Spring row
        // and told the captain the player was "now available" for a date from
        // the previous season.
        const previousIds = new Set(
            await selectUnavailableEventIds(session.user.id, signup.season)
        )

        // Replace only this season's rows: prior seasons' responses are history
        // and must survive the player's first save of a new season.
        await db.transaction(async (tx) => {
            await tx
                .delete(userUnavailability)
                .where(
                    and(
                        eq(userUnavailability.user_id, session.user.id),
                        inArray(
                            userUnavailability.event_id,
                            tx
                                .select({ id: seasonEvents.id })
                                .from(seasonEvents)
                                .where(
                                    eq(seasonEvents.season_id, signup.season)
                                )
                        )
                    )
                )
            if (eventIds.length > 0) {
                await tx.insert(userUnavailability).values(
                    eventIds.map((eventId) => ({
                        user_id: session.user.id,
                        signup_id: signupId,
                        event_id: eventId
                    }))
                )
            }
        })

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

        // Replace only this season's rows, as above.
        await db.transaction(async (tx) => {
            await tx
                .delete(userUnavailability)
                .where(
                    and(
                        eq(userUnavailability.user_id, session.user.id),
                        inArray(
                            userUnavailability.event_id,
                            tx
                                .select({ id: seasonEvents.id })
                                .from(seasonEvents)
                                .where(
                                    eq(seasonEvents.season_id, config.seasonId)
                                )
                        )
                    )
                )
            if (eventIds.length > 0) {
                await tx.insert(userUnavailability).values(
                    eventIds.map((eventId) => ({
                        user_id: session.user.id,
                        event_id: eventId
                    }))
                )
            }
        })

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
