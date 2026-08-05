/**
 * Shared, timezone-safe date/time formatters.
 *
 * All formatters pin the "en-US" locale so rendered output is identical
 * regardless of the server or browser locale. Date-only strings
 * ("YYYY-MM-DD") are parsed as *local* midnight rather than UTC midnight,
 * which avoids the classic off-by-one-day bug where `new Date("2026-03-15")`
 * renders as March 14 in US timezones.
 *
 * This module is dependency-free and pure so it can be imported from both
 * server and client components.
 */

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse a date string, appending T00:00:00 to date-only strings so they are
 * interpreted in the local timezone instead of UTC.
 */
function parseDateOnly(d: string): Date {
    return DATE_ONLY_PATTERN.test(d) ? new Date(`${d}T00:00:00`) : new Date(d)
}

/** Coerce a `Date | string` input to a `Date`, timezone-safely. */
function toDate(input: Date | string): Date {
    return input instanceof Date ? input : parseDateOnly(input)
}

/**
 * Format a date-only string ("YYYY-MM-DD") as a short event date.
 *
 * @example formatEventDate("2026-03-15") // "Sun, Mar 15"
 */
export function formatEventDate(date: string): string {
    return parseDateOnly(date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
    })
}

/**
 * Format a date-only string ("YYYY-MM-DD") as a compact "M/D", for contexts
 * that list several dates inline — audit summaries, for instance.
 *
 * @example formatShortDate("2026-08-13") // "8/13"
 */
export function formatShortDate(date: string): string {
    const d = parseDateOnly(date)
    return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * Format a "HH:MM" or "HH:MM:SS" time string as a 12-hour clock time.
 *
 * @example formatMatchTime("18:30:00") // "6:30 PM"
 */
export function formatMatchTime(time: string): string {
    const [hours, minutes] = time.split(":").map(Number)
    const period = hours >= 12 ? "PM" : "AM"
    const displayHour = hours % 12 || 12
    return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`
}

/**
 * Like {@link formatMatchTime}, but renders an em dash for empty input.
 *
 * @example formatMatchTimeOrDash("") // "—"
 * @example formatMatchTimeOrDash("09:05:00") // "9:05 AM"
 */
export function formatMatchTimeOrDash(time: string): string {
    return time ? formatMatchTime(time) : "—"
}

/**
 * Format a nullable "HH:MM[:SS]" time string as a compact lowercase time,
 * omitting minutes on the hour. Returns `null` for null input and the
 * original string when it cannot be parsed.
 *
 * @example formatCompactTime("18:00:00") // "6pm"
 * @example formatCompactTime("18:30:00") // "6:30pm"
 */
export function formatCompactTime(value: string | null): string | null {
    if (!value) return null
    const [hStr, mStr] = value.split(":")
    const h = Number(hStr)
    const m = Number(mStr)
    if (Number.isNaN(h) || Number.isNaN(m)) return value
    const period = h >= 12 ? "pm" : "am"
    const hour12 = h % 12 === 0 ? 12 : h % 12
    return m === 0
        ? `${hour12}${period}`
        : `${hour12}:${String(m).padStart(2, "0")}${period}`
}

/**
 * Format a timestamp as an abbreviated date with 12-hour time.
 *
 * @example formatTimestamp(new Date(2026, 2, 15, 18, 30)) // "Mar 15, 2026, 06:30 PM"
 */
export function formatTimestamp(date: Date | string): string {
    return toDate(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    })
}

/**
 * Format a timestamp as a full numeric date and time with seconds.
 *
 * @example formatFullTimestamp(new Date(2026, 2, 15, 18, 30, 5)) // "3/15/2026, 6:30:05 PM"
 */
export function formatFullTimestamp(date: Date | string): string {
    return toDate(date).toLocaleString("en-US")
}

// ---------------------------------------------------------------------------
// League timezone
// ---------------------------------------------------------------------------

/**
 * The league plays in the DC metro area; scheduled jobs (which run in UTC)
 * must compute "today"/"tomorrow" in this zone or late-evening runs drift a
 * day.
 */
export const LEAGUE_TIME_ZONE = "America/New_York"

/**
 * Returns "YYYY-MM-DD" for now + offsetDays, evaluated in the league's
 * timezone (en-CA locale formats as ISO date). Offsetting by whole days
 * before formatting keeps DST transitions from shifting the result.
 */
export function getLeagueDateString(offsetDays = 0): string {
    const target = new Date(Date.now() + offsetDays * 86_400_000)
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: LEAGUE_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(target)
}
