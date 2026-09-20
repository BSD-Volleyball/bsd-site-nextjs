/**
 * league-day.ts — "which day is it for the league, and when did that day start".
 *
 * Anonymous survey responses are stamped with the start of the league day
 * rather than the moment they were submitted: an exact timestamp on an
 * otherwise identity-free row would let anyone holding the recipient list line
 * a response up with whoever was answering at that second. Day granularity
 * keeps the response segmentable without keeping it re-identifiable.
 *
 * Pure: no db, no Next, no server-only — so it can be unit-tested directly.
 */

import { LEAGUE_TIME_ZONE } from "@/lib/date-utils"

const PARTS_FORMAT = new Intl.DateTimeFormat("en-CA", {
    timeZone: LEAGUE_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
})

interface WallClock {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
}

/** The league-zone wall clock at `instant`, as plain numbers. */
function wallClockAt(instant: Date): WallClock {
    const parts = PARTS_FORMAT.formatToParts(instant)
    const get = (type: Intl.DateTimeFormatPartTypes): number => {
        const value = parts.find((part) => part.type === type)?.value ?? "0"
        return Number(value)
    }
    // Intl renders midnight as hour 24 in some runtimes; normalise it to 0.
    const hour = get("hour")
    return {
        year: get("year"),
        month: get("month"),
        day: get("day"),
        hour: hour === 24 ? 0 : hour,
        minute: get("minute"),
        second: get("second")
    }
}

/** How far ahead of UTC the league zone is at `instant`, in milliseconds. */
function zoneOffsetMs(instant: Date): number {
    const wall = wallClockAt(instant)
    const asUtc = Date.UTC(
        wall.year,
        wall.month - 1,
        wall.day,
        wall.hour,
        wall.minute,
        wall.second
    )
    // Strip the sub-second part `instant` carries but the wall clock does not.
    return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * "YYYY-MM-DD" for `now`'s league day.
 *
 * `getLeagueDateString` answers the same question but only ever about
 * `Date.now()`. A write that stamps several columns has to read one clock and
 * derive everything from it, or a submit landing on the stroke of midnight can
 * file its date under one day and its timestamps under the next.
 */
export function leagueDateString(now: Date = new Date()): string {
    const wall = wallClockAt(now)
    const month = String(wall.month).padStart(2, "0")
    const day = String(wall.day).padStart(2, "0")
    return `${wall.year}-${month}-${day}`
}

/**
 * Midnight of `now`'s league day, as an instant.
 *
 * DST-safe: the offset is measured at the naive guess and then re-measured at
 * the corrected instant, so a day whose offset changes still resolves to the
 * offset that was in force at midnight. (New York's transitions happen at 2am,
 * so midnight is never the skipped or the doubled hour.)
 */
export function leagueDayMidnight(now: Date = new Date()): Date {
    const [year, month, day] = leagueDateString(now).split("-").map(Number)
    const naive = Date.UTC(year, month - 1, day)

    const firstGuess = naive - zoneOffsetMs(new Date(naive))
    const corrected = naive - zoneOffsetMs(new Date(firstGuess))
    return new Date(corrected)
}
