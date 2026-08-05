"use server"

import { revalidatePath } from "next/cache"
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm"

import { db } from "@/database/db"
import {
    eventTimeSlots,
    tryoutVolunteerAssignments,
    tryoutVolunteerJobs,
    userRoles,
    users
} from "@/database/schema"
import {
    fail,
    ok,
    requireAdmin,
    requireNonEmptyString,
    requirePositiveInt,
    requireSeasonConfig,
    requireSession,
    withAction,
    type ActionResult
} from "@/lib/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import {
    buildVolunteerJobAssignmentHtml,
    type VolunteerJobBlock
} from "@/lib/email-html"
import {
    dispatchNotification,
    type NotificationRecipient
} from "@/lib/notifications/dispatch"
import {
    formatEventTime,
    formatSeasonLabel,
    getEventsByType
} from "@/lib/season-utils"
import { getPlayingSlotsBySeason } from "@/lib/tryout-volunteer-conflicts"
import {
    assignmentNightLabel,
    assignmentTimeLabel,
    getVolunteerAssignmentsForSeason
} from "@/lib/tryout-volunteer-schedule"
import type { TryoutJobScope } from "@/lib/tryout-volunteer-types"
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
    assigned: AssignedVolunteer[]
}

export interface AssignJobView {
    jobId: number
    name: string
    needed: number
    scope: TryoutJobScope
    notes: string | null
    slots: JobSlotView[]
}

export interface AssignNightView {
    eventId: number
    ordinal: number
    eventDate: string
    label: string | null
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

        const [jobs, assignments, playingSlots, eligible] = await Promise.all([
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
            loadEligibleVolunteers(config.seasonId)
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

            const eventJobs = jobs
                .filter((job) => job.event_id === event.id)
                .map((job): AssignJobView => {
                    const jobAssignments = assignments.filter(
                        (a) => a.jobId === job.id
                    )

                    const buildSlot = (
                        timeSlotId: number | null,
                        timeLabel: string
                    ): JobSlotView => ({
                        timeSlotId,
                        timeLabel,
                        assigned: jobAssignments
                            .filter((a) => a.timeSlotId === timeSlotId)
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

                    return {
                        jobId: job.id,
                        name: job.name,
                        needed: job.needed,
                        scope: job.scope,
                        notes: job.notes,
                        slots:
                            job.scope === "whole_night"
                                ? [buildSlot(null, "All night")]
                                : slots.map((slot) =>
                                      buildSlot(
                                          slot.id,
                                          formatEventTime(slot.startTime)
                                      )
                                  )
                    }
                })

            return {
                eventId: event.id,
                ordinal: index + 1,
                eventDate: event.eventDate,
                label: event.label,
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

/**
 * Loads a job and verifies it belongs to the current season, plus that the
 * time slot argument matches the job's scope — a whole-night job must have
 * a null slot and a per-session job must name a slot of its own night.
 */
type ResolvedJob =
    | { error: string }
    | {
          job: typeof tryoutVolunteerJobs.$inferSelect
          timeSlotId: number | null
      }

async function resolveJobAndSlot(
    seasonId: number,
    jobId: number,
    timeSlotId: number | null
): Promise<ResolvedJob> {
    const [job] = await db
        .select()
        .from(tryoutVolunteerJobs)
        .where(eq(tryoutVolunteerJobs.id, jobId))
        .limit(1)
    if (!job || job.season_id !== seasonId) {
        return { error: "Job not found in the current season." as const }
    }

    if (job.scope === "whole_night") {
        if (timeSlotId !== null) {
            return {
                error: "This job is staffed for the whole night." as const
            }
        }
        return { job, timeSlotId: null }
    }

    if (timeSlotId === null) {
        return { error: "Pick a session for this job." as const }
    }

    const [slot] = await db
        .select({ id: eventTimeSlots.id })
        .from(eventTimeSlots)
        .where(
            and(
                eq(eventTimeSlots.id, timeSlotId),
                eq(eventTimeSlots.event_id, job.event_id)
            )
        )
        .limit(1)
    if (!slot) {
        return {
            error: "That session is not part of this tryout date." as const
        }
    }

    return { job, timeSlotId }
}

export const assignVolunteer = withAction(
    async (
        jobId: number,
        timeSlotId: number | null,
        userId: string
    ): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()
        const config = await requireSeasonConfig()

        const jid = requirePositiveInt(jobId, "job ID")
        const slotId =
            timeSlotId === null || timeSlotId === undefined
                ? null
                : requirePositiveInt(timeSlotId, "session ID")
        const targetId = requireNonEmptyString(userId, "User")

        const resolved = await resolveJobAndSlot(config.seasonId, jid, slotId)
        if ("error" in resolved) return fail(resolved.error)

        const [target] = await db
            .select({
                id: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(users)
            .where(eq(users.id, targetId))
            .limit(1)
        if (!target) return fail("User not found.")

        // onConflictDoNothing against the NULLS NOT DISTINCT unique makes a
        // double-click a harmless no-op instead of a duplicate row.
        await db
            .insert(tryoutVolunteerAssignments)
            .values({
                job_id: jid,
                time_slot_id: resolved.timeSlotId,
                user_id: targetId,
                assigned_by: session.user.id
            })
            .onConflictDoNothing()

        await logAuditEntry({
            userId: session.user.id,
            action: "assign_tryout_volunteer",
            entityType: "tryout_volunteer_assignments",
            entityId: jid,
            summary: `Assigned ${formatPlayerName(target.firstName, target.lastName, target.preferredName)} to "${resolved.job.name}"`
        })

        revalidatePath("/dashboard/assign-tryout-jobs")
        revalidatePath("/dashboard")
        return ok()
    }
)

export const unassignVolunteer = withAction(
    async (assignmentId: number): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()
        const config = await requireSeasonConfig()
        const aid = requirePositiveInt(assignmentId, "assignment ID")

        const [row] = await db
            .select({
                id: tryoutVolunteerAssignments.id,
                userId: tryoutVolunteerAssignments.user_id,
                jobName: tryoutVolunteerJobs.name,
                seasonId: tryoutVolunteerJobs.season_id
            })
            .from(tryoutVolunteerAssignments)
            .innerJoin(
                tryoutVolunteerJobs,
                eq(tryoutVolunteerJobs.id, tryoutVolunteerAssignments.job_id)
            )
            .where(eq(tryoutVolunteerAssignments.id, aid))
            .limit(1)
        if (!row || row.seasonId !== config.seasonId) {
            return fail("Assignment not found in the current season.")
        }

        await db
            .delete(tryoutVolunteerAssignments)
            .where(eq(tryoutVolunteerAssignments.id, aid))

        await logAuditEntry({
            userId: session.user.id,
            action: "unassign_tryout_volunteer",
            entityType: "tryout_volunteer_assignments",
            entityId: aid,
            summary: `Removed a volunteer from "${row.jobName}"`
        })

        revalidatePath("/dashboard/assign-tryout-jobs")
        revalidatePath("/dashboard")
        return ok()
    }
)

/**
 * Sends every assigned volunteer one consolidated email listing all their
 * jobs across all tryout nights. Deliberately admin-triggered rather than
 * firing on each assignment — an admin shuffling the board would otherwise
 * send a burst of contradictory emails. Re-sendable on purpose (no dedupe
 * key), matching how week 1-3 roster notifications work.
 */
export const sendVolunteerAssignmentEmails = withAction(
    async (): Promise<ActionResult<{ sent: number; skipped: number }>> => {
        const session = await requireSession()
        await requireAdmin()
        const config = await requireSeasonConfig()

        const assignments = await getVolunteerAssignmentsForSeason(
            config.seasonId
        )
        if (assignments.length === 0) {
            return fail("Nobody is assigned to a job yet.")
        }

        const seasonLabel = formatSeasonLabel(config)
        const blocksByUser = new Map<string, VolunteerJobBlock[]>()
        const recipients: NotificationRecipient[] = []

        for (const assignment of assignments) {
            const block: VolunteerJobBlock = {
                nightLabel: assignmentNightLabel(assignment),
                jobName: assignment.jobName,
                timeLabel: assignmentTimeLabel(assignment),
                notes: assignment.jobNotes
            }

            const existing = blocksByUser.get(assignment.userId)
            if (existing) {
                existing.push(block)
                continue
            }
            blocksByUser.set(assignment.userId, [block])
            recipients.push({
                userId: assignment.userId,
                email: assignment.email,
                firstName: assignment.preferredName || assignment.firstName
            })
        }

        const result = await dispatchNotification({
            type: "tryout_volunteer_assignment",
            recipients,
            subject: `Your Tryout Volunteer Job — ${seasonLabel}`,
            htmlBody: (recipient) =>
                buildVolunteerJobAssignmentHtml({
                    firstName: recipient.firstName ?? "there",
                    seasonLabel,
                    jobs: blocksByUser.get(recipient.userId) ?? []
                }),
            tag: "volunteer-assignment"
        })

        await logAuditEntry({
            userId: session.user.id,
            action: "send_tryout_volunteer_emails",
            entityType: "tryout_volunteer_assignments",
            entityId: config.seasonId,
            summary: `Sent ${result.sent} tryout volunteer assignment email(s)`
        })

        return ok(
            { sent: result.sent, skipped: result.skipped },
            `Sent ${result.sent} email(s)${result.skipped > 0 ? `, skipped ${result.skipped} (opted out or undeliverable).` : "."}`
        )
    }
)
