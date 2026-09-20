/**
 * reminders.ts — follow-up nudges while a survey is still open.
 *
 * Each survey carries its own cadence (`reminder_interval_days`,
 * `reminder_max_count`) so a commissioner can dial reminders up or off per
 * survey. The claim step (`sendSurveyReminder`) is written as an optimistic
 * compare-and-set on `reminder_count` rather than a transaction: two cron
 * runs racing on the same survey will have one of them lose the UPDATE
 * (0 rows matched because the count already moved), so at most one round of
 * reminder mail goes out per interval regardless of overlap. The dedupe key
 * folds in the post-claim count (`survey-<id>-reminder-<n>`), which is also
 * what makes a claimed-but-crashed run safe to retry: the next attempt claims
 * round n+1, and n's dedupe key still protects anyone who was already mailed.
 *
 * Framework-independent: db + drizzle + lib only.
 */

import { and, eq, gt, isNull, or, sql } from "drizzle-orm"
import { site } from "@/config/site"
import { db } from "@/database/db"
import { surveyRecipients, surveys, users } from "@/database/schema"
import { LEAGUE_TIME_ZONE } from "@/lib/date-utils"
import { buildSurveyReminderHtml } from "@/lib/email-html"
import { isLegacyEmail } from "@/lib/legacy-matching"
import {
    type DispatchResult,
    dispatchNotification
} from "@/lib/notifications/dispatch"

export interface SurveyReminderRunResult {
    surveys: number
    sent: number
    skipped: number
    failed: number
}

const NO_DISPATCH: DispatchResult = { sent: 0, failed: 0, skipped: 0 }

function closesLabelFor(closesAt: Date | null): string | null {
    if (!closesAt) return null
    return closesAt.toLocaleString("en-US", {
        timeZone: LEAGUE_TIME_ZONE,
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    })
}

/**
 * Sends one round of reminders for a single survey, if it is due (or always,
 * with `force`). `claimed: false` means nothing was sent because the survey
 * was not open, was not due, or another run already claimed this round.
 */
export async function sendSurveyReminder(
    surveyId: number,
    opts: { force: boolean; now?: Date }
): Promise<DispatchResult & { claimed: boolean }> {
    const now = opts.now ?? new Date()
    const NOT_CLAIMED = { ...NO_DISPATCH, claimed: false }

    const [survey] = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1)
    if (!survey || survey.status !== "open") return NOT_CLAIMED

    if (!opts.force) {
        if (survey.reminder_interval_days <= 0) return NOT_CLAIMED
        if (survey.reminder_count >= survey.reminder_max_count) {
            return NOT_CLAIMED
        }
        const last = survey.last_reminder_at ?? survey.published_at
        if (!last) return NOT_CLAIMED
        const dueAt = new Date(
            last.getTime() + survey.reminder_interval_days * 86_400_000
        )
        if (dueAt > now) return NOT_CLAIMED
        if (survey.closes_at && survey.closes_at <= now) return NOT_CLAIMED
    }

    const [claim] = await db
        .update(surveys)
        .set({
            reminder_count: sql`${surveys.reminder_count} + 1`,
            last_reminder_at: now,
            updated_at: now
        })
        .where(
            and(
                eq(surveys.id, surveyId),
                eq(surveys.status, "open"),
                eq(surveys.reminder_count, survey.reminder_count)
            )
        )
        .returning({ reminder_count: surveys.reminder_count })
    if (!claim) return NOT_CLAIMED

    const n = claim.reminder_count

    const rows = await db
        .select({
            userId: surveyRecipients.user_id,
            email: users.email,
            firstName: users.first_name
        })
        .from(surveyRecipients)
        .innerJoin(users, eq(users.id, surveyRecipients.user_id))
        .where(
            and(
                eq(surveyRecipients.survey_id, surveyId),
                isNull(surveyRecipients.removed_at),
                isNull(surveyRecipients.submitted_at)
            )
        )

    const recipients = rows
        .filter((row) => row.email && !isLegacyEmail(row.email))
        .map((row) => ({
            userId: row.userId,
            email: row.email as string,
            firstName: row.firstName ?? undefined
        }))
    if (recipients.length === 0) return { ...NO_DISPATCH, claimed: true }

    const surveyUrl = `${site.url}/dashboard/surveys/${surveyId}`
    const closesLabel = closesLabelFor(survey.closes_at)

    const dispatchResult = await dispatchNotification({
        type: "survey_reminder",
        recipients,
        subject: `Reminder: ${survey.title}`,
        htmlBody: (recipient) =>
            buildSurveyReminderHtml({
                firstName: recipient.firstName || "there",
                title: survey.title,
                closesLabel,
                surveyUrl
            }),
        tag: "survey-reminder",
        dedupeKey: `survey-${surveyId}-reminder-${n}`
    })

    return { ...dispatchResult, claimed: true }
}

/**
 * Sweeps every open survey whose reminder cadence is due and sends one round
 * of reminders each. Meant to be called by the daily cron alongside
 * `autoCloseExpiredSurveys`, which should run first so an expired survey
 * closes before this reads it (a survey closed by that sweep is `status !==
 * "open"` here and is correctly skipped).
 */
export async function sendDueSurveyReminders(
    now: Date = new Date()
): Promise<SurveyReminderRunResult> {
    // The timestamp columns are naive (`timestamp without time zone`) and the
    // app writes UTC into them, so the comparison value has to be a UTC wall
    // clock too. Drizzle's `gt(column, Date)` handles that for a typed column;
    // a raw `sql` fragment does not, and a bare Date would be bound in the
    // server's local zone. Pass the ISO string explicitly.
    const nowIso = now.toISOString()
    const due = await db
        .select({ id: surveys.id })
        .from(surveys)
        .where(
            and(
                eq(surveys.status, "open"),
                gt(surveys.reminder_interval_days, 0),
                sql`${surveys.reminder_count} < ${surveys.reminder_max_count}`,
                sql`coalesce(${surveys.last_reminder_at}, ${surveys.published_at}) + (${surveys.reminder_interval_days} || ' days')::interval <= ${nowIso}::timestamp`,
                or(isNull(surveys.closes_at), gt(surveys.closes_at, now))
            )
        )

    let sent = 0
    let skipped = 0
    let failed = 0
    for (const row of due) {
        const result = await sendSurveyReminder(row.id, { force: false, now })
        sent += result.sent
        skipped += result.skipped
        failed += result.failed
    }

    return { surveys: due.length, sent, skipped, failed }
}
