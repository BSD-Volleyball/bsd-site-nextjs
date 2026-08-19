/**
 * calendar-links.ts — pure helpers for building the subscription feed URLs
 * shown in the UI, plus the per-platform "subscribe in …" deep links.
 * Client-safe (no db, no server-only imports).
 *
 * Platform links (none are officially documented by the vendors, but all are
 * long-stable and used by the add-to-calendar-button library):
 *  - Google:   https://calendar.google.com/calendar/u/0/r?cid=<webcal URL>
 *              (cid MUST be webcal://; https inside cid is read as a calendar id)
 *  - Outlook.com (personal): https://outlook.live.com/calendar/0/addfromweb/?url=&name=
 *  - Microsoft 365 (work):   https://outlook.office.com/calendar/0/addfromweb/?url=&name=
 *  - Apple / other desktop apps: the bare webcal:// URL (OS protocol handler)
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
    /** Display name suggested to the calendar app (X-WR-CALNAME). */
    name: string
}

export interface CalendarLinks {
    personal: CalendarLink
    friends: CalendarLink
}

export interface BuildCalendarLinksOptions {
    origin?: string
    /** Short name for the personal calendar, e.g. "Josh". */
    personalName?: string
}

export const FRIENDS_CALENDAR_NAME = "BSD Volleyball — Friends"

export function personalCalendarName(shortName: string | null | undefined) {
    return shortName ? `BSD Volleyball — ${shortName}` : "BSD Volleyball"
}

export function buildCalendarLinks(
    token: string,
    options: BuildCalendarLinksOptions = {}
): CalendarLinks {
    const base = (options.origin ?? site.publicUrl).replace(/\/+$/, "")
    const link = (kind: CalendarKind, name: string): CalendarLink => {
        const url = `${base}${calendarFeedPath(token, kind)}`
        return { url, webcalUrl: toWebcalUrl(url), name }
    }
    return {
        personal: link("personal", personalCalendarName(options.personalName)),
        friends: link("friends", FRIENDS_CALENDAR_NAME)
    }
}

// ---------------------------------------------------------------------------
// Per-platform subscribe deep links
// ---------------------------------------------------------------------------

export type CalendarPlatform = "google" | "apple" | "outlook" | "ms365"

export const CALENDAR_PLATFORMS: readonly CalendarPlatform[] = [
    "apple",
    "google",
    "outlook",
    "ms365"
]

export const CALENDAR_PLATFORM_LABELS: Record<CalendarPlatform, string> = {
    apple: "Apple",
    google: "Google",
    outlook: "Outlook.com",
    ms365: "Microsoft 365"
}

export function googleSubscribeUrl(link: Pick<CalendarLink, "webcalUrl">) {
    return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(link.webcalUrl)}`
}

export function outlookSubscribeUrl(
    link: Pick<CalendarLink, "webcalUrl" | "name">,
    variant: "outlook" | "ms365"
) {
    const host =
        variant === "outlook" ? "outlook.live.com" : "outlook.office.com"
    const params = new URLSearchParams({
        url: link.webcalUrl,
        name: link.name
    })
    return `https://${host}/calendar/0/addfromweb/?${params.toString()}`
}

/** The subscribe URL for a platform; Apple is the bare webcal:// link. */
export function platformSubscribeUrl(
    platform: CalendarPlatform,
    link: CalendarLink
): string {
    switch (platform) {
        case "google":
            return googleSubscribeUrl(link)
        case "outlook":
        case "ms365":
            return outlookSubscribeUrl(link, platform)
        case "apple":
            return link.webcalUrl
    }
}
