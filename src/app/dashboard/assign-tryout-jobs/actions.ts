"use server"

import { revalidatePath } from "next/cache"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import { and, eq } from "drizzle-orm"

import { db } from "@/database/db"
import {
    eventTimeSlots,
    seasonEvents,
    tryoutVolunteerAssignments,
    tryoutVolunteerJobs,
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
} from "@/next/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import {
    buildVolunteerJobAssignmentHtml,
    type VolunteerJobBlock
} from "@/lib/email-html"
import {
    dispatchNotification,
    type NotificationRecipient
} from "@/lib/notifications/dispatch"
import { formatSeasonLabel } from "@/lib/season-utils"
import {
    assignmentCourtLabel,
    assignmentNightLabel,
    assignmentTimeLabel,
    getVolunteerAssignmentsForSeason
} from "@/lib/tryout-volunteer-schedule"
import { courtLabel } from "@/lib/tryout-volunteer-types"
import { formatPlayerName } from "@/lib/utils"

/**
 * Loads a job and verifies it belongs to the current season, plus that the
 * time slot and court arguments match the job's scopes — a whole-night job
 * must have a null slot and a per-session job must name a slot of its own
 * night; a general job must have a null court and a per-court job must name
 * one of its night's courts.
 */
type ResolvedJob =
    | { error: string }
    | {
          job: typeof tryoutVolunteerJobs.$inferSelect
          timeSlotId: number | null
          courtNumber: number | null
      }

async function resolveJobAndSlot(
    seasonId: number,
    jobId: number,
    timeSlotId: number | null,
    courtNumber: number | null
): Promise<ResolvedJob> {
    const [job] = await db
        .select()
        .from(tryoutVolunteerJobs)
        .where(eq(tryoutVolunteerJobs.id, jobId))
        .limit(1)
    if (!job || job.season_id !== seasonId) {
        return { error: "Job not found in the current season." as const }
    }

    if (job.court_scope === "general") {
        if (courtNumber !== null) {
            return { error: "This job is not tied to a court." as const }
        }
    } else {
        if (courtNumber === null) {
            return { error: "Pick a court for this job." as const }
        }
        const [event] = await db
            .select({ courtNumbers: seasonEvents.court_numbers })
            .from(seasonEvents)
            .where(eq(seasonEvents.id, job.event_id))
            .limit(1)
        if (!event?.courtNumbers.includes(courtNumber)) {
            return {
                error: "That court is not part of this tryout date." as const
            }
        }
    }

    if (job.scope === "whole_night") {
        if (timeSlotId !== null) {
            return {
                error: "This job is staffed for the whole night." as const
            }
        }
        return { job, timeSlotId: null, courtNumber }
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

    return { job, timeSlotId, courtNumber }
}

export const assignVolunteer = withAction(
    async (
        jobId: number,
        timeSlotId: number | null,
        userId: string,
        courtNumber: number | null = null
    ): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()
        const config = await requireSeasonConfig()

        const jid = requirePositiveInt(jobId, "job ID")
        const slotId =
            timeSlotId === null || timeSlotId === undefined
                ? null
                : requirePositiveInt(timeSlotId, "session ID")
        const court =
            courtNumber === null || courtNumber === undefined
                ? null
                : requirePositiveInt(courtNumber, "court number")
        const targetId = requireNonEmptyString(userId, "User")

        const resolved = await resolveJobAndSlot(
            config.seasonId,
            jid,
            slotId,
            court
        )
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
                court_number: resolved.courtNumber,
                user_id: targetId,
                assigned_by: session.user.id
            })
            .onConflictDoNothing()

        await logAuditEntry({
            userId: session.user.id,
            action: "assign_tryout_volunteer",
            entityType: "tryout_volunteer_assignments",
            entityId: jid,
            summary: `Assigned ${formatPlayerName(target.firstName, target.lastName, target.preferredName)} to "${resolved.job.name}"${
                resolved.courtNumber === null
                    ? ""
                    : ` (${courtLabel(resolved.courtNumber)})`
            }`
        })

        revalidatePath("/dashboard/assign-tryout-jobs")
        revalidatePath("/dashboard")
        revalidateCalendarFeeds()
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
        revalidateCalendarFeeds()
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
                courtLabel: assignmentCourtLabel(assignment),
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
