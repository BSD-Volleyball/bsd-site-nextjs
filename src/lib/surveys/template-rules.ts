/**
 * template-rules.ts — what the template editor may still change.
 *
 * Questions live on the template, so an edit can land under answers that were
 * already collected. Once a question has answers its shape locks: the type,
 * the rating scale and the existing option keys are what past answers were
 * recorded against, and changing any of them would silently reinterpret them.
 * Wording, help text, required, visibility and option labels stay editable,
 * and new options may be appended.
 *
 * Pure and client-safe: the editor runs the same checks before it lets the
 * admin save, and the server action runs them again as the authority.
 */

import { optionsOf } from "./question-types"
import type {
    SurveyQuestionConfig,
    SurveyQuestionDef,
    SurveyQuestionType,
    SurveyVisibility
} from "./types"

/** Input posted by the template editor for one question. id null = new. */
export interface TemplateQuestionInput {
    id: number | null
    type: SurveyQuestionType
    prompt: string
    helpText: string | null
    required: boolean
    config: SurveyQuestionConfig
    visibility: SurveyVisibility
}

/**
 * Whether `incoming` may replace `existing`. `hasAnswers` is true when at
 * least one answer row points at the question; when it is false every change
 * is allowed (config validity itself is the registry's job).
 *
 * Returns a human-readable error, or null when the edit is allowed.
 */
export function validateQuestionUpdate(
    existing: SurveyQuestionDef,
    incoming: TemplateQuestionInput,
    hasAnswers: boolean
): string | null {
    if (!hasAnswers) return null

    if (incoming.type !== existing.type) {
        return "This question already has answers, so its type cannot be changed."
    }

    if (
        existing.config.type === "rating" &&
        incoming.config.type === "rating"
    ) {
        if (
            incoming.config.min !== existing.config.min ||
            incoming.config.max !== existing.config.max
        ) {
            return "This question already has answers, so its scale cannot be changed."
        }
    }

    if (
        existing.config.type === "likert" &&
        incoming.config.type === "likert"
    ) {
        // The agreement scale is a fixed five points; only labels may change.
        const existingKeys = optionsOf(existing.config).map((o) => o.key)
        const incomingKeys = optionsOf(incoming.config).map((o) => o.key)
        const same =
            existingKeys.length === incomingKeys.length &&
            existingKeys.every((key, index) => incomingKeys[index] === key)
        return same
            ? null
            : "This question already has answers, so its agreement scale cannot be changed."
    }

    if ("options" in existing.config && "options" in incoming.config) {
        return validateAppendOnlyOptions(existing.config, incoming.config)
    }

    return null
}

/**
 * Existing option keys must still be there, in the same order; anything after
 * them is a newly added option. Labels are free to change.
 */
function validateAppendOnlyOptions(
    existing: SurveyQuestionConfig,
    incoming: SurveyQuestionConfig
): string | null {
    const existingKeys = optionsOf(existing).map((option) => option.key)
    const incomingKeys = optionsOf(incoming).map((option) => option.key)

    if (incomingKeys.length < existingKeys.length) {
        return "This question already has answers, so its options cannot be removed. Add new options instead."
    }
    for (const [index, key] of existingKeys.entries()) {
        if (incomingKeys[index] !== key) {
            return "This question already has answers, so its options cannot be removed or reordered. Add new options instead."
        }
    }
    return null
}

/**
 * Archiving a question hides it from new surveys, so nothing still in use may
 * branch on it. Only other unarchived questions count; the question's own
 * conditions go away with it.
 *
 * Returns a human-readable error, or null when the archive is allowed.
 */
export function canArchiveQuestion(
    questionId: number,
    questions: SurveyQuestionDef[]
): string | null {
    const dependents = questions.filter(
        (question) =>
            question.id !== questionId &&
            question.archivedAt === null &&
            question.visibility.conditions.some(
                (condition) => condition.questionId === questionId
            )
    )
    if (dependents.length === 0) return null

    const names = dependents
        .map((question) => `"${question.prompt}"`)
        .join(", ")
    return `Another question depends on this one: ${names}. Remove that rule first.`
}
