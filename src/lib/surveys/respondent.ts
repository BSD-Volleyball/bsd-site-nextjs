/**
 * respondent.ts — the answering side of a survey.
 *
 * Everything here is scoped to one person: which surveys they were invited to,
 * what they have answered so far, and the two writes (save a draft, submit)
 * they are allowed to make. Being a recipient *is* the authorization — there is
 * no role to check, only the invite list — so every function takes the acting
 * user id and refuses to touch a survey the user was not invited to, or was
 * removed from.
 *
 * `validateSubmission` is the authority on what gets stored: answers to
 * questions the respondent cannot see (role-gated or branched away) are
 * dropped rather than trusted, so a hand-crafted post cannot smuggle in an
 * answer the form never showed.
 *
 * Anonymity is enforced at submit, not at read: an anonymous response keeps
 * its identity columns while it is a draft (so the respondent can come back to
 * it) and loses them the moment it is submitted, along with its sub-day
 * timestamps. That is one-way, which is why an anonymous survey may only be
 * submitted once.
 *
 * Framework-independent: db + drizzle + lib only.
 */

import { type DbExecutor, db } from "@/database/db"
import {
    surveyAnswers,
    surveyRecipients,
    surveyResponses,
    surveys
} from "@/database/schema"
import { ActionError } from "@/lib/action-result"
import { leagueDateString, leagueDayMidnight } from "./league-day"
import { QUESTION_TYPE_DEFS } from "./question-types"
import { questionsForSurvey } from "./questions-for-survey"
import { getTemplateQuestions } from "./templates"
import type {
    AnswerMap,
    SurveyQuestionDef,
    SurveyRoleTag,
    SurveyStatus
} from "./types"
import { validateSubmission } from "./validate-submission"
import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm"

export { leagueDayMidnight } from "./league-day"

type SurveyRow = typeof surveys.$inferSelect
type RecipientRow = typeof surveyRecipients.$inferSelect
type ResponseRow = typeof surveyResponses.$inferSelect

/** Shown to anyone who is not a live recipient, so the two cases look alike. */
const NOT_FOUND = "Survey not found."
const CLOSED = "This survey is closed."
const ALREADY_SUBMITTED = "You already submitted this survey."

export interface MySurveySummary {
    id: number
    title: string
    intro: string | null
    status: SurveyStatus
    isAnonymous: boolean
    closesAt: Date | null
    responseStatus: "not_started" | "in_progress" | "submitted"
    canEdit: boolean
}

export interface RespondentSurveyView {
    survey: MySurveySummary
    questions: SurveyQuestionDef[]
    roleTags: SurveyRoleTag[]
    answers: AnswerMap
    canEdit: boolean
}

/**
 * Is the survey accepting answers right now? A close date is a deadline, not a
 * state change — the nightly job flips `status` later, but the window shuts the
 * moment it passes.
 */
export function isSurveyOpenNow(
    survey: { status: SurveyStatus; closesAt: Date | null },
    now: Date = new Date()
): boolean {
    if (survey.status !== "open") return false
    return survey.closesAt === null || now < survey.closesAt
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The surveys this user was invited to and can still see: `open` while they
 * are accepting answers, `past` once they are not. Drafts never appear — a
 * survey has no recipients until it is published — and a removed recipient
 * sees nothing.
 */
export async function listSurveysForUser(
    userId: string
): Promise<{ open: MySurveySummary[]; past: MySurveySummary[] }> {
    const rows = await db
        .select({ survey: surveys, recipient: surveyRecipients })
        .from(surveyRecipients)
        .innerJoin(surveys, eq(surveys.id, surveyRecipients.survey_id))
        .where(
            and(
                eq(surveyRecipients.user_id, userId),
                isNull(surveyRecipients.removed_at),
                inArray(surveys.status, ["open", "closed"])
            )
        )
        .orderBy(desc(surveys.id))
    if (rows.length === 0) return { open: [], past: [] }

    // One lookup for every survey in the list: a row exists only once the
    // respondent has started, which is exactly the "in progress" signal.
    const started = await db
        .select({ surveyId: surveyResponses.survey_id })
        .from(surveyResponses)
        .where(
            and(
                inArray(
                    surveyResponses.survey_id,
                    rows.map((row) => row.survey.id)
                ),
                eq(surveyResponses.user_id, userId)
            )
        )
    const startedIds = new Set(started.map((row) => row.surveyId))

    const now = new Date()
    const open: MySurveySummary[] = []
    const past: MySurveySummary[] = []
    for (const row of rows) {
        const summary = toSummary(
            row.survey,
            row.recipient,
            startedIds.has(row.survey.id),
            now
        )
        if (isSurveyOpenNow(toWindow(row.survey), now)) {
            open.push(summary)
        } else {
            past.push(summary)
        }
    }
    return { open, past }
}

/**
 * Everything the respondent form renders, or null when this user has no live
 * invite to the survey.
 *
 * An anonymous survey this user has already submitted reads back with no
 * answers, full stop. The submit severs the link — `findResponse` has nothing
 * to find — but the guarantee is stated here rather than left to rest on that:
 * a stray row carrying this user id, from a future bug or a hand-written
 * script, must not turn into a read-back of an anonymous answer sheet.
 */
export async function getSurveyForRespondent(
    surveyId: number,
    userId: string
): Promise<RespondentSurveyView | null> {
    const context = await loadContext(surveyId, userId)
    if (!context) return null
    const { survey, recipient } = context

    const questions = await loadQuestions(survey)
    const anonymouslySubmitted =
        survey.is_anonymous && recipient.submitted_at !== null
    const response = anonymouslySubmitted
        ? null
        : await findResponse(surveyId, userId)
    const answers = response
        ? await loadAnswers(response.id, questions)
        : ({} as AnswerMap)

    const summary = toSummary(survey, recipient, response !== null, new Date())
    return {
        survey: summary,
        questions,
        roleTags: recipient.role_tags,
        answers,
        canEdit: summary.canEdit
    }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Stores whatever of `answers` is storable and reports the rest. A draft save
 * never rejects a partial sheet: required questions are not enforced, and an
 * answer with the wrong shape is reported and left out rather than failing the
 * whole save.
 */
export async function saveDraft(
    surveyId: number,
    userId: string,
    answers: AnswerMap
): Promise<{ errors: Record<number, string> }> {
    const { errors } = await writeAnswers(surveyId, userId, answers, "draft")
    return { errors }
}

/**
 * Finalises the response. Nothing is written when anything is missing or
 * malformed, so the respondent gets the whole list of problems at once and the
 * stored sheet never sits half-submitted.
 */
export async function submitResponse(
    surveyId: number,
    userId: string,
    answers: AnswerMap
): Promise<{ errors: Record<number, string> } | { submitted: true }> {
    const result = await writeAnswers(surveyId, userId, answers, "submit")
    return result.submitted ? { submitted: true } : { errors: result.errors }
}

async function writeAnswers(
    surveyId: number,
    userId: string,
    answers: AnswerMap,
    mode: "draft" | "submit"
): Promise<{ errors: Record<number, string>; submitted: boolean }> {
    const now = new Date()
    const context = await loadContext(surveyId, userId)
    if (!context) throw new ActionError(NOT_FOUND)
    const { survey, recipient } = context

    if (!isSurveyOpenNow(toWindow(survey), now)) throw new ActionError(CLOSED)
    assertStillAnswerable(survey, recipient)

    const questions = await loadQuestions(survey)
    const { cleaned, errors } = validateSubmission({
        questions,
        answers,
        roleTags: recipient.role_tags,
        mode
    })
    if (mode === "submit" && Object.keys(errors).length > 0) {
        return { errors, submitted: false }
    }

    // An anonymous submit is the one write that must not record when it
    // happened: every timestamp it touches is pinned to the start of the
    // league day instead.
    const stamp =
        mode === "submit" && survey.is_anonymous ? leagueDayMidnight(now) : now

    await db.transaction(async (tx) => {
        // Serialises a double-submit (two tabs, a retried action): the second
        // one waits here and then sees the submitted_at the first one wrote.
        const locked = await lockRecipient(recipient.id, tx)
        assertStillAnswerable(survey, locked)

        const responseId = await upsertResponse(tx, {
            survey,
            recipient: locked,
            userId,
            stamp
        })
        await replaceAnswers(tx, responseId, questions, cleaned, stamp)
        if (mode === "submit") {
            await finishSubmit(tx, { survey, responseId, locked, now, stamp })
        }
    })

    return { errors, submitted: mode === "submit" }
}

/**
 * An anonymous response cannot be revised: the submit already severed the link
 * back to this person, so there is no row left that is knowably theirs.
 */
function assertStillAnswerable(
    survey: SurveyRow,
    recipient: RecipientRow
): void {
    if (recipient.removed_at !== null) throw new ActionError(NOT_FOUND)
    if (survey.is_anonymous && recipient.submitted_at !== null) {
        throw new ActionError(ALREADY_SUBMITTED)
    }
}

async function lockRecipient(
    recipientId: number,
    executor: DbExecutor
): Promise<RecipientRow> {
    const [row] = await executor
        .select()
        .from(surveyRecipients)
        .where(eq(surveyRecipients.id, recipientId))
        .limit(1)
        .for("update")
    if (!row) throw new ActionError(NOT_FOUND)
    return row
}

/** Creates the response sheet on first write, or touches the existing one. */
async function upsertResponse(
    executor: DbExecutor,
    params: {
        survey: SurveyRow
        recipient: RecipientRow
        userId: string
        stamp: Date
    }
): Promise<number> {
    const existing = await findResponse(
        params.survey.id,
        params.userId,
        executor
    )
    if (existing) {
        await executor
            .update(surveyResponses)
            .set({ updated_at: params.stamp })
            .where(eq(surveyResponses.id, existing.id))
        return existing.id
    }

    // Segments are copied from the invite, not recomputed: results stay
    // comparable to the audience the survey was sent to, even after a roster
    // change.
    const [inserted] = await executor
        .insert(surveyResponses)
        .values({
            survey_id: params.survey.id,
            user_id: params.userId,
            recipient_id: params.recipient.id,
            role_tags: params.recipient.role_tags,
            division_id: params.recipient.division_id,
            gender: params.recipient.gender,
            status: "draft",
            created_at: params.stamp,
            updated_at: params.stamp
        })
        .returning({ id: surveyResponses.id })
    return inserted.id
}

/**
 * Marks the sheet submitted. For an anonymous survey this is also where the
 * identity columns and the sub-day timestamps go: after this update the row
 * carries only the segments the results page reports on.
 */
async function finishSubmit(
    executor: DbExecutor,
    params: {
        survey: SurveyRow
        responseId: number
        locked: RecipientRow
        now: Date
        stamp: Date
    }
): Promise<void> {
    // Derived from the same instant the timestamps were, so a submit landing
    // on the stroke of midnight cannot file its date under one league day and
    // its timestamps under the next.
    const submittedOn = leagueDateString(params.now)
    await executor
        .update(surveyResponses)
        .set(
            params.survey.is_anonymous
                ? {
                      user_id: null,
                      recipient_id: null,
                      status: "submitted",
                      submitted_on: submittedOn,
                      created_at: params.stamp,
                      updated_at: params.stamp
                  }
                : {
                      status: "submitted",
                      submitted_on: submittedOn,
                      updated_at: params.stamp
                  }
        )
        .where(eq(surveyResponses.id, params.responseId))

    await executor
        .update(surveyRecipients)
        .set({ submitted_at: params.stamp })
        .where(eq(surveyRecipients.id, params.locked.id))
}

/**
 * Makes the stored answers match `cleaned` exactly. The form posts the whole
 * sheet, so a question missing from it was cleared (or branched away) and its
 * row goes with it — otherwise a stale answer would resurface in the results.
 */
async function replaceAnswers(
    executor: DbExecutor,
    responseId: number,
    questions: SurveyQuestionDef[],
    cleaned: AnswerMap,
    stamp: Date
): Promise<void> {
    const byId = new Map(questions.map((question) => [question.id, question]))
    const kept: number[] = []

    for (const [key, value] of Object.entries(cleaned)) {
        const questionId = Number(key)
        const question = byId.get(questionId)
        if (!question) continue

        const columns = QUESTION_TYPE_DEFS[question.type].toColumns(value)
        kept.push(questionId)
        await executor
            .insert(surveyAnswers)
            .values({
                response_id: responseId,
                question_id: questionId,
                ...columns,
                updated_at: stamp
            })
            .onConflictDoUpdate({
                target: [surveyAnswers.response_id, surveyAnswers.question_id],
                set: { ...columns, updated_at: stamp }
            })
    }

    await executor
        .delete(surveyAnswers)
        .where(
            kept.length === 0
                ? eq(surveyAnswers.response_id, responseId)
                : and(
                      eq(surveyAnswers.response_id, responseId),
                      notInArray(surveyAnswers.question_id, kept)
                  )
        )
}

// ---------------------------------------------------------------------------
// Shared loads
// ---------------------------------------------------------------------------

/**
 * The survey plus this user's live invite, or null when there is none. A draft
 * survey is treated as missing too: recipients are resolved at publish, so an
 * invite to one is a leftover, not an invitation to answer early.
 */
async function loadContext(
    surveyId: number,
    userId: string,
    executor: DbExecutor = db
): Promise<{ survey: SurveyRow; recipient: RecipientRow } | null> {
    const [row] = await executor
        .select({ survey: surveys, recipient: surveyRecipients })
        .from(surveyRecipients)
        .innerJoin(surveys, eq(surveys.id, surveyRecipients.survey_id))
        .where(
            and(
                eq(surveyRecipients.survey_id, surveyId),
                eq(surveyRecipients.user_id, userId),
                isNull(surveyRecipients.removed_at)
            )
        )
        .limit(1)
    if (!row || row.survey.status === "draft") return null
    return row
}

async function loadQuestions(
    survey: SurveyRow,
    executor: DbExecutor = db
): Promise<SurveyQuestionDef[]> {
    const templateQuestions = await getTemplateQuestions(
        survey.template_id,
        executor
    )
    return questionsForSurvey(
        { questionIds: survey.question_ids },
        templateQuestions
    )
}

async function findResponse(
    surveyId: number,
    userId: string,
    executor: DbExecutor = db
): Promise<ResponseRow | null> {
    const [row] = await executor
        .select()
        .from(surveyResponses)
        .where(
            and(
                eq(surveyResponses.survey_id, surveyId),
                eq(surveyResponses.user_id, userId)
            )
        )
        .limit(1)
    return row ?? null
}

/**
 * The stored answers, decoded back into the shape the form posts. A row whose
 * question is no longer part of the survey, or whose columns no longer decode
 * (the question's type changed under it), is left out.
 */
async function loadAnswers(
    responseId: number,
    questions: SurveyQuestionDef[],
    executor: DbExecutor = db
): Promise<AnswerMap> {
    const rows = await executor
        .select()
        .from(surveyAnswers)
        .where(eq(surveyAnswers.response_id, responseId))

    const byId = new Map(questions.map((question) => [question.id, question]))
    const answers: AnswerMap = {}
    for (const row of rows) {
        const question = byId.get(row.question_id)
        if (!question) continue
        const value = QUESTION_TYPE_DEFS[question.type].fromColumns(row)
        if (value !== null) answers[question.id] = value
    }
    return answers
}

function toWindow(survey: SurveyRow): {
    status: SurveyStatus
    closesAt: Date | null
} {
    return { status: survey.status, closesAt: survey.closes_at }
}

function toSummary(
    survey: SurveyRow,
    recipient: RecipientRow,
    hasResponse: boolean,
    now: Date
): MySurveySummary {
    const submitted = recipient.submitted_at !== null
    return {
        id: survey.id,
        title: survey.title,
        intro: survey.intro,
        status: survey.status,
        isAnonymous: survey.is_anonymous,
        closesAt: survey.closes_at,
        responseStatus: describeProgress(submitted, hasResponse),
        canEdit:
            isSurveyOpenNow(toWindow(survey), now) &&
            !(survey.is_anonymous && submitted)
    }
}

function describeProgress(
    submitted: boolean,
    hasResponse: boolean
): MySurveySummary["responseStatus"] {
    if (submitted) return "submitted"
    return hasResponse ? "in_progress" : "not_started"
}
