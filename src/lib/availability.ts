/**
 * Shared pieces of the availability write path, used both by the player-facing
 * My Availability action and the admin Edit Player action so the two stay in
 * lockstep on validation and captain notification.
 */
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import {
    seasonEvents,
    teams,
    userUnavailability,
    users
} from "@/database/schema"
import { buildAvailabilityChangeHtml } from "@/lib/email-html"
import { dispatchNotification } from "@/lib/notifications/dispatch"
import { findActiveTeamForUser } from "@/lib/roster"
import { formatEventDate } from "@/lib/site-config"
import { formatDisplayName } from "@/lib/utils"

/**
 * Resolves the submitted ids to this season's events, or null if any of them
 * belongs elsewhere. Guards against ids from another season riding along in a
 * save: the page hands the form whatever rows the user has, and a season's
 * events are re-created often enough that stale ids are a live hazard —
 * reattached to the current signup they show up as phantom absences in captain
 * and roster views.
 */
export async function resolveSeasonEvents(
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

/**
 * Emails the player's captain(s) a diff of the change. Only fires when the
 * player is active on a current-season roster; dispatchNotification never
 * throws, so this can't fail the availability save.
 */
export async function notifyCaptainsOfAvailabilityChange(
    userId: string,
    seasonId: number,
    becameUnavailable: number[],
    becameAvailable: number[]
): Promise<void> {
    if (becameUnavailable.length === 0 && becameAvailable.length === 0) return

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
        subject: `${playerName} updated their availability`,
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

/**
 * The event ids a user is currently marked unavailable for in one season.
 * Scoped by season on purpose: rows can outlive the season they were entered
 * for, and an unscoped read feeds prior-season ids straight back into a form,
 * which then submits them.
 */
export async function selectUnavailableEventIds(
    userId: string,
    seasonId: number
): Promise<number[]> {
    const rows = await db
        .select({ eventId: userUnavailability.event_id })
        .from(userUnavailability)
        .innerJoin(
            seasonEvents,
            eq(seasonEvents.id, userUnavailability.event_id)
        )
        .where(
            and(
                eq(userUnavailability.user_id, userId),
                eq(seasonEvents.season_id, seasonId)
            )
        )
    return rows.map((r) => r.eventId)
}
