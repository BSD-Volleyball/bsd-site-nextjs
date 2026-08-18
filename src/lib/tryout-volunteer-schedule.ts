/**
 * Shared reader for tryout volunteer assignments.
 *
 * Three callers need the same joined shape — the Assign Tryout Jobs page,
 * the volunteer's dashboard card, and the day-before reminder cron — so the
 * join lives here once rather than being re-derived in each.
 */

import "server-only"

import { and, asc, eq, inArray } from "drizzle-orm"

import { db } from "@/database/db"
import {
    eventTimeSlots,
    seasonEvents,
    tryoutVolunteerAssignments,
    tryoutVolunteerJobs,
    users
} from "@/database/schema"
import { formatEventDate, formatEventTime } from "@/lib/season-utils"
import {
    courtLabel,
    type TryoutJobCourtScope,
    type TryoutJobScope
} from "@/lib/tryout-volunteer-types"

export interface VolunteerAssignmentDetail {
    assignmentId: number
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    email: string
    jobId: number
    jobName: string
    jobNotes: string | null
    scope: TryoutJobScope
    courtScope: TryoutJobCourtScope
    /** Which court a per-court assignment covers; null for general jobs. */
    courtNumber: number | null
    eventId: number
    eventDate: string
    eventLabel: string | null
    /** 1-based position of this tryout night within the season. */
    ordinal: number
    timeSlotId: number | null
    startTime: string | null
}

async function loadAssignments(
    eventIds: number[],
    ordinalByEventId: Map<number, number>
): Promise<VolunteerAssignmentDetail[]> {
    if (eventIds.length === 0) return []

    const rows = await db
        .select({
            assignmentId: tryoutVolunteerAssignments.id,
            userId: tryoutVolunteerAssignments.user_id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            email: users.email,
            jobId: tryoutVolunteerJobs.id,
            jobName: tryoutVolunteerJobs.name,
            jobNotes: tryoutVolunteerJobs.notes,
            scope: tryoutVolunteerJobs.scope,
            courtScope: tryoutVolunteerJobs.court_scope,
            courtNumber: tryoutVolunteerAssignments.court_number,
            jobSortOrder: tryoutVolunteerJobs.sort_order,
            eventId: seasonEvents.id,
            eventDate: seasonEvents.event_date,
            eventLabel: seasonEvents.label,
            timeSlotId: tryoutVolunteerAssignments.time_slot_id,
            startTime: eventTimeSlots.start_time,
            slotSortOrder: eventTimeSlots.sort_order
        })
        .from(tryoutVolunteerAssignments)
        .innerJoin(
            tryoutVolunteerJobs,
            eq(tryoutVolunteerJobs.id, tryoutVolunteerAssignments.job_id)
        )
        .innerJoin(
            seasonEvents,
            eq(seasonEvents.id, tryoutVolunteerJobs.event_id)
        )
        .innerJoin(users, eq(users.id, tryoutVolunteerAssignments.user_id))
        .leftJoin(
            eventTimeSlots,
            eq(eventTimeSlots.id, tryoutVolunteerAssignments.time_slot_id)
        )
        .where(inArray(tryoutVolunteerJobs.event_id, eventIds))
        .orderBy(
            asc(seasonEvents.sort_order),
            asc(tryoutVolunteerJobs.sort_order),
            asc(tryoutVolunteerAssignments.court_number),
            asc(eventTimeSlots.sort_order),
            asc(users.last_name)
        )

    return rows.map((row) => ({
        assignmentId: row.assignmentId,
        userId: row.userId,
        firstName: row.firstName,
        lastName: row.lastName,
        preferredName: row.preferredName,
        email: row.email,
        jobId: row.jobId,
        jobName: row.jobName,
        jobNotes: row.jobNotes,
        scope: row.scope,
        courtScope: row.courtScope,
        courtNumber: row.courtNumber,
        eventId: row.eventId,
        eventDate: row.eventDate,
        eventLabel: row.eventLabel,
        ordinal: ordinalByEventId.get(row.eventId) ?? 0,
        timeSlotId: row.timeSlotId,
        startTime: row.startTime
    }))
}

/**
 * Court numbers configured for each of the given tryout nights, keyed by
 * event id. Nights with no courts listed map to an empty array.
 */
export async function getTryoutCourtNumbersByEvent(
    eventIds: number[]
): Promise<Map<number, number[]>> {
    if (eventIds.length === 0) return new Map()
    const rows = await db
        .select({
            id: seasonEvents.id,
            courtNumbers: seasonEvents.court_numbers
        })
        .from(seasonEvents)
        .where(inArray(seasonEvents.id, eventIds))
    return new Map(
        rows.map((row) => [row.id, [...row.courtNumbers].sort((a, b) => a - b)])
    )
}

/** Every volunteer assignment across the season's tryout nights. */
export async function getVolunteerAssignmentsForSeason(
    seasonId: number
): Promise<VolunteerAssignmentDetail[]> {
    const events = await db
        .select({ id: seasonEvents.id })
        .from(seasonEvents)
        .where(
            and(
                eq(seasonEvents.season_id, seasonId),
                eq(seasonEvents.event_type, "tryout")
            )
        )
        .orderBy(asc(seasonEvents.sort_order), asc(seasonEvents.id))

    const ordinalByEventId = new Map(
        events.map((event, index) => [event.id, index + 1])
    )
    return loadAssignments(
        events.map((e) => e.id),
        ordinalByEventId
    )
}

/**
 * Volunteer assignments for tryout nights falling on a specific date
 * (YYYY-MM-DD). Used by the reminder cron, which knows a date but not a
 * season.
 */
export async function getVolunteerAssignmentsForDate(
    date: string
): Promise<VolunteerAssignmentDetail[]> {
    const matching = await db
        .select({ id: seasonEvents.id, seasonId: seasonEvents.season_id })
        .from(seasonEvents)
        .where(
            and(
                eq(seasonEvents.event_type, "tryout"),
                eq(seasonEvents.event_date, date)
            )
        )
    if (matching.length === 0) return []

    // Ordinals still come from the full season so the email can say
    // "Tryout 2" rather than "Tryout 1".
    const seasonIds = [...new Set(matching.map((m) => m.seasonId))]
    const allEvents = await db
        .select({
            id: seasonEvents.id,
            seasonId: seasonEvents.season_id
        })
        .from(seasonEvents)
        .where(
            and(
                eq(seasonEvents.event_type, "tryout"),
                inArray(seasonEvents.season_id, seasonIds)
            )
        )
        .orderBy(asc(seasonEvents.sort_order), asc(seasonEvents.id))

    const ordinalByEventId = new Map<number, number>()
    const seenPerSeason = new Map<number, number>()
    for (const event of allEvents) {
        const next = (seenPerSeason.get(event.seasonId) ?? 0) + 1
        seenPerSeason.set(event.seasonId, next)
        ordinalByEventId.set(event.id, next)
    }

    return loadAssignments(
        matching.map((m) => m.id),
        ordinalByEventId
    )
}

/**
 * Whether an assignment covers the whole evening rather than one session —
 * either by scope, or because no session time is set. Callers that label the
 * assignment and callers that order it must both read this, or a whole-night
 * job that carries a stray time slot reads "All night" while sorting at that
 * slot's time.
 */
export function isAllNightAssignment(
    assignment: Pick<VolunteerAssignmentDetail, "scope" | "startTime">
): boolean {
    return assignment.scope === "whole_night" || !assignment.startTime
}

/** Human-readable "when" for one assignment, e.g. "All night" or "6:00 PM". */
export function assignmentTimeLabel(
    assignment: VolunteerAssignmentDetail
): string {
    const { startTime } = assignment
    if (!startTime || isAllNightAssignment(assignment)) {
        return "All night"
    }
    return formatEventTime(startTime)
}

/** Human-readable "which night", e.g. "Tryout 2 — Thursday, September 17, 2026". */
export function assignmentNightLabel(
    assignment: VolunteerAssignmentDetail
): string {
    const prefix =
        assignment.ordinal > 0 ? `Tryout ${assignment.ordinal} — ` : ""
    return `${prefix}${formatEventDate(assignment.eventDate)}`
}

/** "Court 3" for a per-court assignment, or null for a general one. */
export function assignmentCourtLabel(
    assignment: Pick<VolunteerAssignmentDetail, "courtNumber">
): string | null {
    return assignment.courtNumber === null
        ? null
        : courtLabel(assignment.courtNumber)
}
