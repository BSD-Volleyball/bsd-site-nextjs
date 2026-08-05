"use server"

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import {
    seasonEvents,
    signups,
    teams,
    userUnavailability,
    users
} from "@/database/schema"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requirePositiveInt
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"
import { logAvailabilityChange } from "@/lib/availability-audit"
import { buildAvailabilityChangeHtml } from "@/lib/email-html"
import { dispatchNotification } from "@/lib/notifications/dispatch"
import { findActiveTeamForUser } from "@/lib/roster"
import { formatEventDate, getSeasonConfig } from "@/lib/site-config"
import { formatDisplayName } from "@/lib/utils"

/**
 * Resolves the submitted ids to this season's events, or null if any of them
 * belongs elsewhere. Guards against ids from another season riding along in a
 * save: the page hands the form whatever rows the user has, and a season's
 * events are re-created often enough that stale ids are a live hazard —
 * reattached to the current signup they show up as phantom absences in captain
 * and roster views.
 */
async function resolveSeasonEvents(
    eventIds: number[],
    seasonId: number
): Promise<{ id: number; date: string }[] | null> {
    if (eventIds.length === 0) return []
    const rows = await db
        .select({ id: seasonEvents.id, date: seasonEvents.event_date })
        .from(seasonEvents)
        .where(
            and(
                eq(seasonEvents.season_id, seasonId),
                inArray(seasonEvents.id, eventIds)
            )
        )
    return rows.length === eventIds.length ? rows : null
}

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
        if (becameUnavailable.length > 0 || becameAvailable.length > 0) {
            await notifyCaptainsOfAvailabilityChange(
                session.user.id,
                signup.season,
                becameUnavailable,
                becameAvailable
            )
        }

        return ok(undefined, "Your availability has been updated.")
    }
)

/**
 * Emails the player's captain(s) a diff of the change. Only fires when the
 * player is active on a current-season roster; dispatchNotification never
 * throws, so this can't fail the availability save.
 */
async function notifyCaptainsOfAvailabilityChange(
    userId: string,
    seasonId: number,
    becameUnavailable: number[],
    becameAvailable: number[]
): Promise<void> {
    const team = await findActiveTeamForUser(userId, seasonId)
    if (!team) return

    const [teamRow] = await db
        .select({
            name: teams.name,
            number: teams.number,
            captain: teams.captain,
            captain2: teams.captain2
        })
        .from(teams)
        .where(eq(teams.id, team.teamId))
        .limit(1)
    if (!teamRow) return

    const captainIds = [teamRow.captain, teamRow.captain2].filter(
        (id): id is string => !!id && id !== userId
    )
    if (captainIds.length === 0) return

    const changedEventIds = [...becameUnavailable, ...becameAvailable]
    const [captainRows, playerRows, eventRows] = await Promise.all([
        db
            .select({
                id: users.id,
                email: users.email,
                firstName: users.first_name,
                preferredName: users.preferred_name
            })
            .from(users)
            .where(inArray(users.id, captainIds)),
        db
            .select({
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(users)
            .where(eq(users.id, userId)),
        db
            .select({
                id: seasonEvents.id,
                label: seasonEvents.label,
                eventType: seasonEvents.event_type,
                eventDate: seasonEvents.event_date
            })
            .from(seasonEvents)
            .where(inArray(seasonEvents.id, changedEventIds))
    ])
    const player = playerRows[0]
    if (!player) return

    const eventById = new Map(eventRows.map((e) => [e.id, e]))
    const describeEvent = (id: number): string => {
        const event = eventById.get(id)
        if (!event) return `Event #${id}`
        const name = event.label || event.eventType.replaceAll("_", " ")
        return `${name} — ${formatEventDate(event.eventDate)}`
    }

    const playerName = formatDisplayName(
        player.firstName,
        player.lastName,
        player.preferredName
    )
    const teamName = teamRow.name || `Team ${teamRow.number ?? team.teamId}`

    await dispatchNotification({
        type: "captain_availability_change",
        recipients: captainRows.map((c) => ({
            userId: c.id,
            email: c.email,
            firstName: c.preferredName || c.firstName
        })),
        subject: `BSD Volleyball: ${playerName} updated their availability`,
        htmlBody: (r) =>
            buildAvailabilityChangeHtml({
                captainFirstName: r.firstName ?? "Captain",
                playerName,
                teamName,
                nowUnavailable: becameUnavailable.map(describeEvent),
                nowAvailable: becameAvailable.map(describeEvent)
            }),
        tag: "availability-change"
    })
}

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
