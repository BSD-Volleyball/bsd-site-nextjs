/**
 * validate-submission.ts — the one answer check both sides run.
 *
 * The respondent form uses it to show inline errors as people type; the save
 * and submit actions use it as the authority on what gets written, so a
 * hand-crafted post cannot smuggle in answers to questions the respondent
 * never saw.
 *
 * Pure and client-safe: no db, no server-only, no Next imports.
 */

import { QUESTION_TYPE_DEFS, isEmptyAnswer } from "./question-types"
import type { AnswerMap, SurveyQuestionDef, SurveyRoleTag } from "./types"
import { evaluateVisibility } from "./visibility"

export interface SubmissionValidation {
    visible: Set<number>
    /** The answers worth persisting: visible, answerable, and valid. */
    cleaned: AnswerMap
    /** Error message per question id. */
    errors: Record<number, string>
}

export const REQUIRED_MESSAGE = "This question is required."

/**
 * Splits the submitted answers into what may be stored and what the respondent
 * still has to fix. Answers to hidden, unknown, archived or answer-less
 * questions are dropped silently; a badly shaped answer is reported and
 * dropped in both modes, so a draft never persists a value the survey could
 * not render back. Only "submit" enforces `required`, and only on the
 * questions the respondent can actually see.
 */
export function validateSubmission(input: {
    questions: SurveyQuestionDef[]
    answers: AnswerMap
    roleTags: SurveyRoleTag[]
    mode: "draft" | "submit"
}): SubmissionValidation {
    const { questions, answers, roleTags, mode } = input
    const visible = evaluateVisibility({ questions, answers, roleTags })
    const cleaned: AnswerMap = {}
    const errors: Record<number, string> = {}

    const answerable = questions.filter(
        (question) =>
            question.archivedAt === null &&
            QUESTION_TYPE_DEFS[question.type].hasAnswer &&
            visible.has(question.id)
    )

    for (const question of answerable) {
        const value = answers[question.id]
        if (value === undefined || isEmptyAnswer(value)) continue

        const error = QUESTION_TYPE_DEFS[question.type].validateAnswer(
            question,
            value
        )
        if (error) {
            errors[question.id] = error
        } else {
            cleaned[question.id] = value
        }
    }

    if (mode === "submit") {
        for (const question of answerable) {
            if (!question.required) continue
            if (question.id in cleaned || question.id in errors) continue
            errors[question.id] = REQUIRED_MESSAGE
        }
    }

    return { visible, cleaned, errors }
}
