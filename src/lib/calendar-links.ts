/**
 * calendar-links.ts — pure helpers for building the subscription feed URLs
 * shown in the UI. Client-safe (no db, no server-only imports).
 */

import { site } from "@/config/site"

export type CalendarKind = "personal" | "friends"

export const CALENDAR_KINDS: readonly CalendarKind[] = ["personal", "friends"]

export function isCalendarKind(value: unknown): value is CalendarKind {
    return value === "personal" || value === "friends"
}

export function calendarFeedPath(token: string, kind: CalendarKind): string {
    return `/api/calendar/${encodeURIComponent(token)}/${kind}.ics`
}

/** Apple/Outlook open `webcal://` links straight into a subscribe dialog. */
export function toWebcalUrl(httpUrl: string): string {
    return httpUrl.replace(/^https?:/, "webcal:")
}

export interface CalendarLink {
    url: string
    webcalUrl: string
}

export interface CalendarLinks {
    personal: CalendarLink
    friends: CalendarLink
}

export function buildCalendarLinks(
    token: string,
    origin: string = site.publicUrl
): CalendarLinks {
    const base = origin.replace(/\/+$/, "")
    const link = (kind: CalendarKind): CalendarLink => {
        const url = `${base}${calendarFeedPath(token, kind)}`
        return { url, webcalUrl: toWebcalUrl(url) }
    }
    return { personal: link("personal"), friends: link("friends") }
}
