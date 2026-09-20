/**
 * lifecycle.ts — publishing a survey, inviting its audience, closing it.
 *
 * Publish is the moment a survey stops being editable and becomes a thing
 * people were asked to answer, so it happens once, inside one transaction,
 * behind a `FOR UPDATE` lock on the survey row: two commissioners hitting the
 * button together produce one invite list, not two. Everything the run needs
 * frozen is frozen there — the question list (`question_ids`) so a later
 * template edit cannot change a survey already in flight, and each recipient's
 * role tags, division and gender so the results stay segmentable after rosters
 * move on.
 *
 * Mail goes out after the commit, never inside it: dispatchNotification never
 * throws, but a long batch send inside the transaction would hold the lock for
 * the length of an HTTP call to Postmark, and a rollback after sending cannot
 * unsend anything. The dedupe key (`survey-<id>-invite`) makes the send
 * idempotent, so re-inviting only reaches people who were never claimed —
 * which is exactly what adding a recipient later needs.
 *
 * Framework-independent: db + drizzle + lib only.
 */

import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm"
import { site } from "@/config/site"
import { db } from "@/database/db"
import { surveyRecipients, surveys, users } from "@/database/schema"
import { ActionError } from "@/lib/action-result"
import { formatTimestamp } from "@/lib/date-utils"
import { buildSurveyInvitationHtml } from "@/lib/email-html"
import { logger } from "@/lib/logger"
import {
    type DispatchResult,
    dispatchNotification
} from "@/lib/notifications/dispatch"
import { isLegacyEmail } from "@/lib/legacy-matching"
import { resolveAudience } from "./audience"
import { QUESTION_TYPE_DEFS } from "./question-types"
import { computeRecipientSegments } from "./role-tags"
import { getTemplateQuestions } from "./templates"
import type { RespondentSegments } from "./types"
import { validateVisibilityGraph } from "./visibility"

export interface PublishResult {
    recipients: number
    invitations: DispatchResult
}

const NO_DISPATCH: DispatchResult = { sent: 0, failed: 0, skipped: 0 }

const NO_SEGMENTS: RespondentSegments = {
    roleTags: [],
    divisionId: null,
    gender: null
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

/**
 * Resolves the audience, writes the recipient list, and opens the survey.
 * Throws ActionError with a message the editor can show when the survey is
 * not publishable; nothing is written unless every check passes.
 */
export async function publishSurvey(
    surveyId: number,
    actorId: string
): Promise<PublishResult> {
    const recipientCount = await db.transaction(async (tx) => {
        const [survey] = await tx
            .select()
            .from(surveys)
            .where(eq(surveys.id, surveyId))
            .limit(1)
            .for("update")
        if (!survey) throw new ActionError("Survey not found.")
        if (survey.status !== "draft") {
            throw new ActionError("This survey has already been published.")
        }

        // A close date already in the past would publish a survey that is
        // open and expired at once: nobody can answer it, and the next
        // auto-close sweep shuts it again. Catch it here rather than letting
        // the invitations go out first.
        if (survey.closes_at && survey.closes_at <= new Date()) {
            throw new ActionError("Close date must be in the future.")
        }

        const questions = await getTemplateQuestions(survey.template_id, tx)
        const active = questions.filter((q) => q.archivedAt === null)

        const graphErrors = validateVisibilityGraph(active)
        if (graphErrors.length > 0) throw new ActionError(graphErrors[0])

        const answerable = active.filter(
            (q) => QUESTION_TYPE_DEFS[q.type].hasAnswer
        )
        if (answerable.length === 0) {
            throw new ActionError(
                "Add at least one question that takes an answer before publishing."
            )
        }

        const { recipients } = await resolveAudience(
            survey.audience,
            survey.season_id
        )
        if (recipients.length === 0) {
            throw new ActionError("The audience is empty.")
        }

        const segments = await computeRecipientSegments(
            survey.season_id,
            recipients.map((r) => r.userId)
        )
        const now = new Date()

        await tx
            .insert(surveyRecipients)
            .values(
                recipients.map((recipient) => {
                    const segment =
                        segments.get(recipient.userId) ?? NO_SEGMENTS
                    return {
                        survey_id: surveyId,
                        user_id: recipient.userId,
                        role_tags: segment.roleTags,
                        division_id: segment.divisionId,
                        gender: segment.gender,
                        invited_at: now
                    }
                })
            )
            // A recipient row that already exists keeps its first invite.
            .onConflictDoNothing()

        await tx
            .update(surveys)
            .set({
                status: "open",
                question_ids: active.map((q) => q.id),
                published_at: now,
                updated_at: now
            })
            .where(eq(surveys.id, surveyId))

        return recipients.length
    })

    logger.info("[surveys] Published survey", {
        surveyId,
        actorId,
        recipients: recipientCount
    })

    // The survey is open and its recipients are written; an invitation that
    // fails to go out must not surface as a failed publish, or the retry hits
    // "already published" with no way forward. dispatchNotification swallows
    // its own send failures, but the reads around it can still throw.
    let invitations: DispatchResult = { ...NO_DISPATCH }
    try {
        invitations = await sendSurveyInvitations(surveyId)
    } catch (error) {
        logger.error(
            "[surveys] Invitations failed after publish",
            { surveyId },
            error
        )
    }

    return { recipients: recipientCount, invitations }
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

/**
 * Emails the survey's live recipients, or just `recipientIds` when given.
 * The shared dedupe key means anyone already invited is skipped rather than
 * mailed twice, so this is safe to call again after adding recipients.
 */
export async function sendSurveyInvitations(
    surveyId: number,
    recipientIds?: number[]
): Promise<DispatchResult> {
    if (recipientIds && recipientIds.length === 0) return { ...NO_DISPATCH }

    const [survey] = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .limit(1)
    if (!survey) return { ...NO_DISPATCH }

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
                recipientIds
                    ? inArray(surveyRecipients.id, recipientIds)
                    : undefined
            )
        )

    const recipients = rows
        .filter((row) => row.email && !isLegacyEmail(row.email))
        .map((row) => ({
            userId: row.userId,
            email: row.email as string,
            firstName: row.firstName ?? undefined
        }))
    if (recipients.length === 0) return { ...NO_DISPATCH }

    const surveyUrl = `${site.url}/dashboard/surveys/${surveyId}`
    const closesLabel = survey.closes_at
        ? formatTimestamp(survey.closes_at)
        : null

    return dispatchNotification({
        type: "survey_invitation",
        recipients,
        subject: `You're invited: ${survey.title}`,
        htmlBody: (recipient) =>
            buildSurveyInvitationHtml({
                firstName: recipient.firstName || "there",
                title: survey.title,
                intro: survey.intro,
                closesLabel,
                isAnonymous: survey.is_anonymous,
                surveyUrl
            }),
        tag: "survey-invitation",
        dedupeKey: `survey-${surveyId}-invite`
    })
}

// ---------------------------------------------------------------------------
// Closing
// ---------------------------------------------------------------------------

/** Closes an open survey. A survey that is already closed is left alone. */
export async function closeSurvey(
    surveyId: number,
    reason: "manual" | "expired"
): Promise<void> {
    const now = new Date()
    const closed = await db
        .update(surveys)
        .set({ status: "closed", closed_at: now, updated_at: now })
        .where(and(eq(surveys.id, surveyId), eq(surveys.status, "open")))
        .returning({ id: surveys.id })

    if (closed.length > 0) {
        logger.info("[surveys] Closed survey", { surveyId, reason })
    }
}

/** Closes every open survey whose deadline has passed. Returns how many. */
export async function autoCloseExpiredSurveys(now: Date): Promise<number> {
    const closed = await db
        .update(surveys)
        .set({ status: "closed", closed_at: now, updated_at: now })
        .where(
            and(
                eq(surveys.status, "open"),
                isNotNull(surveys.closes_at),
                lte(surveys.closes_at, now)
            )
        )
        .returning({ id: surveys.id })

    if (closed.length > 0) {
        logger.info("[surveys] Auto-closed expired surveys", {
            count: closed.length,
            surveyIds: closed.map((row) => row.id)
        })
    }
    return closed.length
}

// ---------------------------------------------------------------------------
// Recipient list edits
// ---------------------------------------------------------------------------

/**
 * Adds people to an open survey after the fact. Already-invited recipients are
 * left untouched, previously removed ones come back with fresh segments, and
 * only the rows this call touched are mailed.
 */
export async function addRecipients(
    surveyId: number,
    userIds: string[],
    actorId: string
): Promise<{ added: number; invitations: DispatchResult }> {
    const requested = [...new Set(userIds)].filter((id) => id !== "")
    if (requested.length === 0) {
        return { added: 0, invitations: { ...NO_DISPATCH } }
    }

    const affected = await db.transaction(async (tx) => {
        const [survey] = await tx
            .select()
            .from(surveys)
            .where(eq(surveys.id, surveyId))
            .limit(1)
            .for("update")
        if (!survey) throw new ActionError("Survey not found.")
        if (survey.status !== "open") {
            throw new ActionError(
                "Recipients can only be added while the survey is open."
            )
        }

        // Unknown ids would break the foreign key, and a placeholder account
        // has no reachable address — neither belongs on an invite list.
        const known = await tx
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(inArray(users.id, requested))
        const addable = known
            .filter((row) => row.email && !isLegacyEmail(row.email))
            .map((row) => row.id)
        if (addable.length === 0) return []

        const existing = await tx
            .select({
                id: surveyRecipients.id,
                userId: surveyRecipients.user_id,
                removedAt: surveyRecipients.removed_at
            })
            .from(surveyRecipients)
            .where(
                and(
                    eq(surveyRecipients.survey_id, surveyId),
                    inArray(surveyRecipients.user_id, addable)
                )
            )
        const existingIds = new Set(existing.map((row) => row.userId))
        const toInsert = addable.filter((id) => !existingIds.has(id))
        const toRestore = existing.filter((row) => row.removedAt !== null)
        if (toInsert.length === 0 && toRestore.length === 0) return []

        const segments = await computeRecipientSegments(survey.season_id, [
            ...toInsert,
            ...toRestore.map((row) => row.userId)
        ])
        const now = new Date()

        const inserted =
            toInsert.length > 0
                ? await tx
                      .insert(surveyRecipients)
                      .values(
                          toInsert.map((userId) => {
                              const segment =
                                  segments.get(userId) ?? NO_SEGMENTS
                              return {
                                  survey_id: surveyId,
                                  user_id: userId,
                                  role_tags: segment.roleTags,
                                  division_id: segment.divisionId,
                                  gender: segment.gender,
                                  invited_at: now,
                                  added_by: actorId
                              }
                          })
                      )
                      .onConflictDoNothing()
                      .returning({ id: surveyRecipients.id })
                : []

        for (const row of toRestore) {
            const segment = segments.get(row.userId) ?? NO_SEGMENTS
            await tx
                .update(surveyRecipients)
                .set({
                    removed_at: null,
                    role_tags: segment.roleTags,
                    division_id: segment.divisionId,
                    gender: segment.gender,
                    invited_at: now,
                    added_by: actorId
                })
                .where(eq(surveyRecipients.id, row.id))
        }

        return [
            ...inserted.map((row) => row.id),
            ...toRestore.map((row) => row.id)
        ]
    })

    if (affected.length === 0) {
        return { added: 0, invitations: { ...NO_DISPATCH } }
    }

    logger.info("[surveys] Added recipients", {
        surveyId,
        actorId,
        added: affected.length
    })

    const invitations = await sendSurveyInvitations(surveyId, affected)
    return { added: affected.length, invitations }
}

/**
 * Takes someone off the invite list. Their submitted response, if any, stays:
 * an answer already given is part of the results.
 */
export async function removeRecipient(
    surveyId: number,
    userId: string
): Promise<void> {
    await db
        .update(surveyRecipients)
        .set({ removed_at: new Date() })
        .where(
            and(
                eq(surveyRecipients.survey_id, surveyId),
                eq(surveyRecipients.user_id, userId),
                isNull(surveyRecipients.removed_at)
            )
        )
}
