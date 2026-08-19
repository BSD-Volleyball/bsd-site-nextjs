/**
 * calendar-feed.ts — assembles a complete .ics document for a user.
 *
 * Shared by the session-gated download route and the token-gated
 * subscription route, so both produce identical calendars. Performs NO
 * authorization: callers must have already established who `userId` is.
 */

import "server-only"

import {
    friendsCalendarEvents,
    personalCalendarEvents
} from "@/lib/calendar-events"
import type { CalendarKind } from "@/lib/calendar-links"
import { listFriendIds } from "@/lib/friends"
import { buildICalendar } from "@/lib/generate-ical"
import { getScheduleForUsers } from "@/lib/schedule-items"

export interface BuiltCalendar {
    ics: string
    filename: string
}

function slug(label: string): string {
    return label.toLowerCase().replace(/\s+/g, "-")
}

/** Returns null when the user doesn't exist. */
export async function buildCalendar(
    kind: CalendarKind,
    userId: string,
    seasonId: number
): Promise<BuiltCalendar | null> {
    const userIds =
        kind === "friends"
            ? [userId, ...(await listFriendIds(userId))]
            : [userId]
    const bundle = await getScheduleForUsers(userIds, seasonId)
    const owner = bundle.people.get(userId)
    if (!owner) return null

    // A fixed per-season stamp keeps subscribed clients from treating every
    // refresh as an edit; the content itself is deterministic.
    const dtstamp = new Date(Date.UTC(bundle.seasonYear ?? 2000, 0, 1))
    const seasonSlug = slug(bundle.seasonLabel || "season")

    if (kind === "friends") {
        return {
            ics: buildICalendar(friendsCalendarEvents(bundle, userId), {
                calName: "BSD Volleyball — Friends",
                dtstamp
            }),
            filename: `bsd-friends-${seasonSlug}.ics`
        }
    }

    const name = owner.preferredName || owner.firstName
    return {
        ics: buildICalendar(personalCalendarEvents(bundle, userId), {
            calName: `BSD Volleyball — ${name}`,
            dtstamp
        }),
        filename: `bsd-schedule-${seasonSlug}.ics`
    }
}

/** A valid, empty calendar — served when there is no season to report. */
export function emptyCalendar(kind: CalendarKind): string {
    return buildICalendar([], {
        calName:
            kind === "friends"
                ? "BSD Volleyball — Friends"
                : "BSD Volleyball Schedule",
        dtstamp: new Date(Date.UTC(2000, 0, 1))
    })
}
