/**
 * Day-before reminders for tryout volunteer jobs.
 *
 * Mirrors game-reminders.ts: one dispatch per volunteer, keyed by date so a
 * re-run of the cron is a no-op. A volunteer with several jobs on the same
 * night gets one email listing all of them.
 */

import { formatEventDate } from "@/lib/season-utils"
import {
    buildVolunteerJobReminderHtml,
    type VolunteerJobBlock
} from "@/lib/email-html"
import {
    assignmentCourtLabel,
    assignmentNightLabel,
    assignmentTimeLabel,
    getVolunteerAssignmentsForDate
} from "@/lib/tryout-volunteer-schedule"
import { dispatchNotification, type NotificationRecipient } from "./dispatch"

export interface VolunteerReminderRunResult {
    date: string
    volunteers: number
    sent: number
    skipped: number
    failed: number
}

export async function sendVolunteerJobRemindersForDate(
    date: string
): Promise<VolunteerReminderRunResult> {
    const result: VolunteerReminderRunResult = {
        date,
        volunteers: 0,
        sent: 0,
        skipped: 0,
        failed: 0
    }

    const assignments = await getVolunteerAssignmentsForDate(date)
    if (assignments.length === 0) return result

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

    result.volunteers = recipients.length
    const dateLabel = formatEventDate(date)

    const dispatched = await dispatchNotification({
        type: "tryout_volunteer_reminder",
        recipients,
        subject: `You're volunteering at tryouts tomorrow — ${dateLabel}`,
        htmlBody: (recipient) =>
            buildVolunteerJobReminderHtml({
                firstName: recipient.firstName ?? "there",
                dateLabel,
                jobs: blocksByUser.get(recipient.userId) ?? []
            }),
        tag: "volunteer-reminder",
        dedupeKey: `volunteer-jobs-${date}`
    })

    result.sent = dispatched.sent
    result.skipped = dispatched.skipped
    result.failed = dispatched.failed
    return result
}
