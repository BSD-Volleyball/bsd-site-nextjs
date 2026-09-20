/**
 * visibility.ts — the branching evaluator.
 *
 * Decides which questions a respondent sees, given their answers so far and
 * the role tags computed for them, and checks that an edited question list
 * only ever points backwards at questions that can answer the question asked
 * of them.
 *
 * The respondent form re-runs `evaluateVisibility` on every keystroke and the
 * submit action re-runs it server-side, so this file stays pure and
 * client-safe: no db, no server-only, no Next imports.
 */

import { QUESTION_TYPE_DEFS, isEmptyAnswer, optionsOf } from "./question-types"
import type {
    AnswerMap,
    AnswerValue,
    SurveyAnswerCondition,
    SurveyQuestionDef,
    SurveyRoleTag
} from "./types"

/** Dependency types an `in`/`not_in` condition can read. */
const LIST_OPERATOR_TYPES = [
    "yes_no",
    "likert",
    "single_choice",
    "multi_choice",
    "ranking"
] as const

/**
 * Does the dependency's answer satisfy the condition? An unanswered or
 * mistyped dependency never matches, so a `not_in` child stays hidden until
 * its parent is answered.
 */
export function conditionMatches(
    condition: SurveyAnswerCondition,
    dependency: SurveyQuestionDef,
    value: AnswerValue | undefined
): boolean {
    if (value === undefined || isEmptyAnswer(value)) return false
    if (!QUESTION_TYPE_DEFS[dependency.type].hasAnswer) return false

    switch (condition.operator) {
        case "in":
        case "not_in": {
            const matched = matchesValues(dependency, condition.values, value)
            if (matched === null) return false
            return condition.operator === "in" ? matched : !matched
        }
        default: {
            if (dependency.type !== "rating" || typeof value !== "number") {
                return false
            }
            if (condition.operator === "eq") return value === condition.value
            if (condition.operator === "gte") return value >= condition.value
            return value <= condition.value
        }
    }
}

/**
 * null when the dependency type cannot be matched against a list of values,
 * or when its answer has the wrong shape.
 */
function matchesValues(
    dependency: SurveyQuestionDef,
    values: string[],
    value: AnswerValue
): boolean | null {
    switch (dependency.type) {
        case "yes_no":
            if (typeof value !== "boolean") return null
            return values.includes(value ? "yes" : "no")
        case "likert":
        case "single_choice":
            if (typeof value !== "string") return null
            return values.includes(value)
        case "multi_choice":
            if (!Array.isArray(value)) return null
            return value.some((key) => values.includes(key))
        case "ranking":
            if (!Array.isArray(value)) return null
            return typeof value[0] === "string" && values.includes(value[0])
        default:
            return null
    }
}

/**
 * The ids of the questions the respondent should see. A question is visible
 * when it is not archived, its role tags (if any) intersect the respondent's,
 * and every condition's dependency is itself visible, answered and matching.
 * Dependencies always precede their dependants (`validateVisibilityGraph`
 * enforces that on save), so one pass in sort order decides the whole list.
 */
export function evaluateVisibility(input: {
    questions: SurveyQuestionDef[]
    answers: AnswerMap
    roleTags: SurveyRoleTag[]
}): Set<number> {
    const { questions, answers, roleTags } = input
    const byId = new Map(questions.map((question) => [question.id, question]))
    const visible = new Set<number>()

    for (const question of sortedQuestions(questions)) {
        if (question.archivedAt !== null) continue

        const gates = question.visibility?.roleTags ?? []
        if (gates.length > 0 && !gates.some((tag) => roleTags.includes(tag))) {
            continue
        }

        const conditions = question.visibility?.conditions ?? []
        const satisfied = conditions.every((condition) => {
            const dependency = byId.get(condition.questionId)
            // A dependency that is missing, hidden, or not yet decided (a
            // forward reference) leaves the condition unsatisfiable.
            if (!dependency || !visible.has(dependency.id)) return false
            return conditionMatches(
                condition,
                dependency,
                answers[dependency.id]
            )
        })
        if (satisfied) visible.add(question.id)
    }

    return visible
}

/** Ascending sort order, with the id breaking ties so the pass is stable. */
function sortedQuestions(questions: SurveyQuestionDef[]): SurveyQuestionDef[] {
    return [...questions].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.id - b.id
    )
}

/**
 * Every problem with the question list's conditions, as sentences the template
 * editor can show. Empty when the graph is sound.
 */
export function validateVisibilityGraph(
    questions: SurveyQuestionDef[]
): string[] {
    const errors: string[] = []
    const byId = new Map(questions.map((question) => [question.id, question]))

    for (const question of questions) {
        const name = label(question)
        for (const condition of question.visibility?.conditions ?? []) {
            if (condition.questionId === question.id) {
                errors.push(`${name} cannot depend on itself.`)
                continue
            }

            const dependency = byId.get(condition.questionId)
            if (!dependency) {
                errors.push(
                    `${name} depends on a question that no longer exists.`
                )
                continue
            }

            const depName = label(dependency)
            if (dependency.archivedAt !== null) {
                errors.push(`${name} depends on ${depName}, which is archived.`)
                continue
            }
            if (
                dependency.sortOrder > question.sortOrder ||
                (dependency.sortOrder === question.sortOrder &&
                    dependency.id >= question.id)
            ) {
                errors.push(
                    `${name} can only depend on a question that comes before it.`
                )
                continue
            }

            const error = conditionError(condition, dependency, name, depName)
            if (error) errors.push(error)
        }
    }

    errors.push(...cycleErrors(questions, byId))
    return errors
}

/** Operator/type and referenced-value checks for one condition. */
function conditionError(
    condition: SurveyAnswerCondition,
    dependency: SurveyQuestionDef,
    name: string,
    depName: string
): string | null {
    switch (condition.operator) {
        case "in":
        case "not_in": {
            if (
                !(LIST_OPERATOR_TYPES as readonly string[]).includes(
                    dependency.type
                )
            ) {
                return `${name} cannot match ${depName} against a list of options.`
            }
            if (dependency.type === "yes_no") {
                return condition.values.every((v) => v === "yes" || v === "no")
                    ? null
                    : `${name} must compare ${depName} to yes or no.`
            }
            const keys = optionsOf(dependency.config).map(
                (option) => option.key
            )
            return condition.values.every((value) => keys.includes(value))
                ? null
                : `${name} refers to an option ${depName} no longer offers.`
        }
        default: {
            if (dependency.config.type !== "rating") {
                return `${name} can only use a numeric comparison on a rating question.`
            }
            const { min, max } = dependency.config
            return condition.value >= min && condition.value <= max
                ? null
                : `${name} must compare ${depName} to a value between ${min} and ${max}.`
        }
    }
}

/**
 * Loops among the conditions. Ordering alone rules these out, but the editor
 * reorders questions, so the check stands on its own: one error per loop,
 * naming the questions in the order they point at each other.
 */
function cycleErrors(
    questions: SurveyQuestionDef[],
    byId: Map<number, SurveyQuestionDef>
): string[] {
    const errors: string[] = []
    const reported = new Set<string>()
    const state = new Map<number, "visiting" | "done">()

    const walk = (question: SurveyQuestionDef, path: number[]) => {
        state.set(question.id, "visiting")
        for (const condition of question.visibility?.conditions ?? []) {
            const dependency = byId.get(condition.questionId)
            // Self references get their own, clearer error above.
            if (!dependency || dependency.id === question.id) continue
            if (state.get(dependency.id) === "visiting") {
                const start = path.indexOf(dependency.id)
                const loop = start === -1 ? [dependency.id] : path.slice(start)
                const key = [...loop].sort((a, b) => a - b).join(",")
                if (!reported.has(key)) {
                    reported.add(key)
                    const names = [...loop, loop[0]].map((id) => {
                        const q = byId.get(id)
                        return q ? label(q) : `question ${id}`
                    })
                    errors.push(`Conditions form a loop: ${names.join(" → ")}.`)
                }
                continue
            }
            if (state.get(dependency.id) === undefined) {
                walk(dependency, [...path, dependency.id])
            }
        }
        state.set(question.id, "done")
    }

    for (const question of questions) {
        if (state.get(question.id) === undefined) walk(question, [question.id])
    }

    return errors
}

/** The question's prompt in quotes, trimmed to stay readable in an error list. */
function label(question: SurveyQuestionDef): string {
    const prompt = question.prompt.trim()
    if (prompt === "") return "This question"
    return `"${prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt}"`
}
