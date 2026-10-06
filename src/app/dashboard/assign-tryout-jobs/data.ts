import "server-only"

import { and, asc, eq, inArray, isNull, or } from "drizzle-orm"

import { db } from "@/database/db"
import { tryoutVolunteerJobs, userRoles, users } from "@/database/schema"
import {
    ok,
    requireAdmin,
    requireSeasonConfig,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import {
    formatEventTime,
    formatSeasonLabel,
    getEventsByType
} from "@/lib/season-utils"
import { getPlayingSlotsBySeason } from "@/lib/tryout-volunteer-conflicts"
import {
    getTryoutCourtNumbersByEvent,
    getVolunteerAssignmentsForSeason
} from "@/lib/tryout-volunteer-schedule"
import type {
    TryoutJobCourtScope,
    TryoutJobScope
} from "@/lib/tryout-volunteer-types"
import { formatPlayerName } from "@/lib/utils"

/** Roles that make someone eligible to be assigned a tryout job. */
const ELIGIBLE_ROLES = ["tryout_volunteer", "admin", "leadership_group"]

export interface EligibleVolunteer {
    id: string
    name: string
    email: string
    /** Which of the eligible roles they hold, for display. */
    roles: string[]
}

export interface AssignedVolunteer {
    assignmentId: number
    userId: string
    name: string
    /** True when this person is rostered to PLAY in this same session. */
    conflict: boolean
}

export interface JobSlotView {
    /** null for whole-night jobs. */
    timeSlotId: number | null
    timeLabel: string
    /** null for general jobs; one of the night's courts for per-court jobs. */
    courtNumber: number | null
    assigned: AssignedVolunteer[]
}

export interface AssignJobView {
    jobId: number
    name: string
    needed: number
    scope: TryoutJobScope
    courtScope: TryoutJobCourtScope
    notes: string | null
    /**
     * Every fillable slot: one per session (or one "All night") for general
     * jobs, and that × every court for per-court jobs. Ordered court-major.
     */
    slots: JobSlotView[]
}

export interface AssignNightView {
    eventId: number
    ordinal: number
    eventDate: string
    label: string | null
    /** Courts configured for the night; per-court jobs fan out over these. */
    courtNumbers: number[]
    jobs: AssignJobView[]
}

export interface AssignTryoutJobsView {
    seasonId: number
    seasonLabel: string
    nights: AssignNightView[]
    eligible: EligibleVolunteer[]
}

export const getAssignTryoutJobsView = withAction(
    async (): Promise<ActionResult<AssignTryoutJobsView | null>> => {
        await requireAdmin()
        const config = await requireSeasonConfig()

        const tryoutEvents = getEventsByType(config, "tryout")
        if (tryoutEvents.length === 0) return ok(null)

        const [jobs, assignments, playingSlots, eligible, courtsByEvent] =
            await Promise.all([
                db
                    .select()
                    .from(tryoutVolunteerJobs)
                    .where(eq(tryoutVolunteerJobs.season_id, config.seasonId))
                    .orderBy(
                        asc(tryoutVolunteerJobs.sort_order),
                        asc(tryoutVolunteerJobs.id)
                    ),
                getVolunteerAssignmentsForSeason(config.seasonId),
                getPlayingSlotsBySeason(config),
                loadEligibleVolunteers(config.seasonId),
                getTryoutCourtNumbersByEvent(tryoutEvents.map((e) => e.id))
            ])

        const nameById = new Map(eligible.map((e) => [e.id, e.name]))
        // Someone assigned before losing the role still needs a name.
        for (const assignment of assignments) {
            if (!nameById.has(assignment.userId)) {
                nameById.set(
                    assignment.userId,
                    formatPlayerName(
                        assignment.firstName,
                        assignment.lastName,
                        assignment.preferredName
                    )
                )
            }
        }

        const nights: AssignNightView[] = tryoutEvents.map((event, index) => {
            const slots = [...event.timeSlots].sort(
                (a, b) => a.sortOrder - b.sortOrder
            )
            const courtNumbers = courtsByEvent.get(event.id) ?? []

            const eventJobs = jobs
                .filter((job) => job.event_id === event.id)
                .map((job): AssignJobView => {
                    const jobAssignments = assignments.filter(
                        (a) => a.jobId === job.id
                    )

                    const buildSlot = (
                        timeSlotId: number | null,
                        timeLabel: string,
                        courtNumber: number | null
                    ): JobSlotView => ({
                        timeSlotId,
                        timeLabel,
                        courtNumber,
                        assigned: jobAssignments
                            .filter(
                                (a) =>
                                    a.timeSlotId === timeSlotId &&
                                    a.courtNumber === courtNumber
                            )
                            .map((a) => ({
                                assignmentId: a.assignmentId,
                                userId: a.userId,
                                name:
                                    nameById.get(a.userId) ??
                                    formatPlayerName(
                                        a.firstName,
                                        a.lastName,
                                        a.preferredName
                                    ),
                                conflict: hasConflict(
                                    playingSlots.get(a.userId),
                                    timeSlotId,
                                    slots.map((s) => s.id)
                                )
                            }))
                    })

                    // Session slots for one court (or for the whole night's
                    // general staffing when courtNumber is null).
                    const sessionSlots = (courtNumber: number | null) =>
                        job.scope === "whole_night"
                            ? [buildSlot(null, "All night", courtNumber)]
                            : slots.map((slot) =>
                                  buildSlot(
                                      slot.id,
                                      formatEventTime(slot.startTime),
                                      courtNumber
                                  )
                              )

                    return {
                        jobId: job.id,
                        name: job.name,
                        needed: job.needed,
                        scope: job.scope,
                        courtScope: job.court_scope,
                        notes: job.notes,
                        slots:
                            job.court_scope === "per_court"
                                ? courtNumbers.flatMap((court) =>
                                      sessionSlots(court)
                                  )
                                : sessionSlots(null)
                    }
                })

            return {
                eventId: event.id,
                ordinal: index + 1,
                eventDate: event.eventDate,
                label: event.label,
                courtNumbers,
                jobs: eventJobs
            }
        })

        return ok({
            seasonId: config.seasonId,
            seasonLabel: formatSeasonLabel(config),
            nights,
            eligible
        })
    }
)

/**
 * A per-session assignment conflicts when the volunteer plays that exact
 * session. A whole-night assignment conflicts when they play ANY session
 * that night — they can't staff the whole evening if they're on a court
 * for part of it.
 */
function hasConflict(
    playing: Set<number> | undefined,
    timeSlotId: number | null,
    nightSlotIds: number[]
): boolean {
    if (!playing || playing.size === 0) return false
    if (timeSlotId !== null) return playing.has(timeSlotId)
    return nightSlotIds.some((id) => playing.has(id))
}

async function loadEligibleVolunteers(
    seasonId: number
): Promise<EligibleVolunteer[]> {
    const rows = await db
        .select({
            id: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            email: users.email,
            role: userRoles.role
        })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.user_id))
        .where(
            and(
                inArray(userRoles.role, ELIGIBLE_ROLES),
                or(
                    eq(userRoles.season_id, seasonId),
                    isNull(userRoles.season_id)
                )
            )
        )
        .orderBy(asc(users.last_name), asc(users.first_name))

    const byUser = new Map<string, EligibleVolunteer>()
    for (const row of rows) {
        const existing = byUser.get(row.id)
        if (existing) {
            if (!existing.roles.includes(row.role))
                existing.roles.push(row.role)
            continue
        }
        byUser.set(row.id, {
            id: row.id,
            name: formatPlayerName(
                row.firstName,
                row.lastName,
                row.preferredName
            ),
            email: row.email,
            roles: [row.role]
        })
    }

    return [...byUser.values()]
}
