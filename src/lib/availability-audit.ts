/**
 * Audit trail for player availability.
 *
 * `user_unavailability` used to be the only record of what a player had
 * entered, so when the 2026-08-05 season-config save cascade-deleted every
 * Fall 2026 row there was nothing to restore from. Every write path now logs
 * the resulting selection here under a single action name, so
 * `action = 'update_availability'` finds a player's history whether they set it
 * during the signup wizard or later on the My Availability page.
 *
 * Entries carry the FULL resulting set rather than a diff: one row is then
 * enough to reconstruct a player's availability without replaying history.
 */
import { inArray } from "drizzle-orm"
import type { DbExecutor } from "@/database/db"
import { db } from "@/database/db"
import { seasonEvents } from "@/database/schema"
import { logAuditEntry } from "@/lib/audit-log"
import { formatShortDate } from "@/lib/date-utils"

export const AVAILABILITY_AUDIT_ACTION = "update_availability"

/**
 * Render a selection as an audit summary.
 *
 * @example describeAvailability([{ date: "2026-10-03" }]) // "Unavailable for 1 date: 10/3"
 * @example describeAvailability([]) // "Available for all dates"
 */
export function describeAvailability(events: { date: string }[]): string {
    if (events.length === 0) return "Available for all dates"
    // Chronological, not the order the client submitted — otherwise two
    // identical selections can produce different summaries.
    const dates = [...events]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => formatShortDate(e.date))
    return `Unavailable for ${dates.length} ${dates.length === 1 ? "date" : "dates"}: ${dates.join(", ")}`
}

/**
 * Look up the dates for a set of event ids, for callers that hold ids but need
 * dates to describe them. Accepts an executor so it can run inside the signup
 * transaction and see rows that have not committed yet.
 */
export async function selectEventDates(
    eventIds: number[],
    executor: DbExecutor = db
): Promise<{ date: string }[]> {
    if (eventIds.length === 0) return []
    return executor
        .select({ date: seasonEvents.event_date })
        .from(seasonEvents)
        .where(inArray(seasonEvents.id, eventIds))
}

/**
 * Record a player's resulting availability.
 *
 * `entityId` is the signup the selection belongs to, or the user id for refs,
 * who have no signup. `context` prefixes the summary to say where the save came
 * from ("At signup", "Ref availability").
 */
export async function logAvailabilityChange(
    params: {
        userId: string
        entityId: string | number
        events: { date: string }[]
        context?: string
    },
    executor: DbExecutor = db
): Promise<void> {
    const summary = describeAvailability(params.events)
    await logAuditEntry(
        {
            userId: params.userId,
            action: AVAILABILITY_AUDIT_ACTION,
            entityType: "user_unavailability",
            entityId: params.entityId,
            summary: params.context ? `${params.context} — ${summary}` : summary
        },
        executor
    )
}
