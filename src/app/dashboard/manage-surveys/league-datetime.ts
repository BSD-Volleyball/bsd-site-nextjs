/**
 * league-datetime.ts — converts between an `<input type="datetime-local">`
 * value (a wall-clock time with no zone) and a UTC instant, always
 * interpreting the wall clock in `LEAGUE_TIME_ZONE`.
 *
 * Client-safe: no server imports.
 */

import { LEAGUE_TIME_ZONE } from "@/lib/date-utils"

/**
 * Parses a "YYYY-MM-DDTHH:mm" value as a wall-clock time in
 * `LEAGUE_TIME_ZONE` and returns the matching instant as an ISO UTC string
 * (or null for an empty/invalid value).
 *
 * There is no direct API for "this wall time, in that zone" so this takes two
 * passes: guess the instant by treating the wall time as UTC, look up what
 * that guess actually reads as in the league zone, and correct by the
 * difference. A second pass (using the corrected guess) resolves the
 * spring-forward/fall-back edge cases a single pass can miss.
 */
export function leagueLocalToIso(value: string): string | null {
    if (!value) return null
    const match = value.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
    )
    if (!match) return null
    const [, y, mo, d, h, mi, s] = match
    const wallUtcMs = Date.UTC(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(h),
        Number(mi),
        Number(s ?? "0")
    )
    if (Number.isNaN(wallUtcMs)) return null

    const offset1 = offsetMsAt(wallUtcMs)
    const offset2 = offsetMsAt(wallUtcMs - offset1)
    const instantMs = wallUtcMs - offset2
    const result = new Date(instantMs)
    if (Number.isNaN(result.getTime())) return null
    return result.toISOString()
}

/** Inverse: a UTC instant to the "YYYY-MM-DDTHH:mm" wall clock in the league zone. */
export function isoToLeagueLocal(date: Date): string {
    const parts = partsAt(date.getTime())
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/**
 * A human-readable rendering of a timestamp in the league zone, e.g.
 * "Jan 15, 2027, 6:30 PM". Accepts a Date, an ISO string, or null (renders
 * as an em dash) so callers can pass a nullable row field straight through.
 */
export function formatLeagueDateTime(date: Date | string | null): string {
    if (!date) return "—"
    const instant = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(instant.getTime())) return "—"
    return instant.toLocaleString("en-US", {
        timeZone: LEAGUE_TIME_ZONE,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    })
}

/**
 * `LEAGUE_TIME_ZONE`'s offset (in ms, to be subtracted from a wall-clock time
 * expressed as UTC millis to get the real UTC instant) as observed at the
 * given instant.
 */
function offsetMsAt(instantMs: number): number {
    const parts = partsAt(instantMs)
    const asIfUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second)
    )
    return asIfUtc - instantMs
}

function partsAt(instantMs: number): {
    year: string
    month: string
    day: string
    hour: string
    minute: string
    second: string
} {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: LEAGUE_TIME_ZONE,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    })
    const map: Record<string, string> = {}
    for (const part of formatter.formatToParts(new Date(instantMs))) {
        if (part.type !== "literal") map[part.type] = part.value
    }
    return {
        year: map.year,
        month: map.month,
        day: map.day,
        hour: map.hour,
        minute: map.minute,
        second: map.second ?? "00"
    }
}
