"use server"

import {
    type MySurveySummary,
    type RespondentSurveyView,
    getSurveyForRespondent,
    listSurveysForUser,
    saveDraft,
    submitResponse
} from "@/lib/surveys/respondent"
import type { AnswerMap, AnswerValue } from "@/lib/surveys/types"
import {
    type ActionResult,
    fail,
    ok,
    requirePositiveInt,
    requireSession,
    withAction
} from "@/next/action-helpers"

// The respondent endpoints. Authorization is the invite list rather than a
// role: every signed-in user may answer the surveys they were invited to, and
// the lib refuses anything else, so these actions only establish who is asking.

/**
 * Answers cross the RSC boundary as whatever the client sent, so the shape is
 * rebuilt here rather than trusted: keys that are not question ids and values
 * that could never be stored are dropped before the lib sees them. What
 * survives is still only a candidate — `validateSubmission` decides what is
 * actually written.
 */
function sanitizeAnswers(input: unknown): AnswerMap {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return {}
    }

    const answers: AnswerMap = {}
    for (const [key, value] of Object.entries(input)) {
        const questionId = Number(key)
        if (!Number.isInteger(questionId) || questionId <= 0) continue
        const clean = sanitizeAnswerValue(value)
        if (clean !== null) answers[questionId] = clean
    }
    return answers
}

function sanitizeAnswerValue(value: unknown): AnswerValue | null {
    if (typeof value === "boolean" || typeof value === "string") return value
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        return value as string[]
    }
    return null
}

export const getMySurveys = withAction(
    async (): Promise<
        ActionResult<{ open: MySurveySummary[]; past: MySurveySummary[] }>
    > => {
        const session = await requireSession()
        return ok(await listSurveysForUser(session.user.id))
    }
)

export const getMySurvey = withAction(
    async (surveyId: number): Promise<ActionResult<RespondentSurveyView>> => {
        const session = await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")

        const view = await getSurveyForRespondent(id, session.user.id)
        if (!view) return fail("Survey not found.")
        return ok(view)
    }
)

export const saveSurveyDraft = withAction(
    async (
        surveyId: number,
        answers: AnswerMap
    ): Promise<ActionResult<{ errors: Record<number, string> }>> => {
        const session = await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")

        return ok(
            await saveDraft(id, session.user.id, sanitizeAnswers(answers))
        )
    }
)

export const submitSurveyResponse = withAction(
    async (
        surveyId: number,
        answers: AnswerMap
    ): Promise<
        ActionResult<{ errors: Record<number, string> } | { submitted: true }>
    > => {
        const session = await requireSession()
        const id = requirePositiveInt(surveyId, "survey ID")

        return ok(
            await submitResponse(id, session.user.id, sanitizeAnswers(answers))
        )
    }
)
