/**
 * format.ts — survey display formatting shared by the admin and respondent
 * sides.
 *
 * Client-safe on purpose: no db, no server-only, no Next imports, so a
 * "use client" list/table/card can import it directly.
 */

import { LEAGUE_TIME_ZONE } from "@/lib/date-utils"

/**
 * A human-readable rendering of a timestamp in the league zone, e.g.
 * "Jan 15, 2027, 6:30 PM". Accepts a Date, an ISO string, or null (renders
 * as an em dash) so callers can pass a nullable row field straight through.
 *
 * One formatting for every survey timestamp — close dates on the respondent
 * list and form, the dashboard card's deadline line, and the admin
 * recipient/list tables — so the same instant never reads two different ways
 * depending on which screen shows it.
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
