/**
 * question-types.ts — the question-type registry.
 *
 * One entry per survey question type, holding everything the rest of the
 * feature needs to know about it: editor copy, the default config a new
 * question starts from, config and answer validation, and how an answer maps
 * onto the four value columns of survey_answers.
 *
 * Client-safe: pure functions and constants only, no db or server imports.
 */

import {
    type AnswerValue,
    LIKERT_OPTIONS,
    RATING_PRESETS,
    SURVEY_LIMITS,
    type SurveyOption,
    type SurveyQuestionConfig,
    type SurveyQuestionDef,
    type SurveyQuestionType
} from "./types"

export interface AnswerColumns {
    value_bool: boolean | null
    value_number: number | null
    value_text: string | null
    value_options: string[] | null
}

export interface QuestionTypeDef {
    label: string
    description: string
    hasAnswer: boolean
    defaultConfig(): SurveyQuestionConfig
    /** null when valid, else a human-readable error */
    validateConfig(config: SurveyQuestionConfig): string | null
    /** null when valid; value has already passed isEmpty() === false */
    validateAnswer(
        question: SurveyQuestionDef,
        value: AnswerValue
    ): string | null
    toColumns(value: AnswerValue): AnswerColumns
    fromColumns(columns: AnswerColumns): AnswerValue | null
}

const NO_COLUMNS: AnswerColumns = {
    value_bool: null,
    value_number: null,
    value_text: null,
    value_options: null
}

/** Shared option-list rules for single_choice, multi_choice and ranking. */
function validateOptionList(
    options: SurveyOption[] | undefined
): string | null {
    if (!Array.isArray(options) || options.length < 2) {
        return "Add at least two options."
    }
    if (options.length > SURVEY_LIMITS.maxOptions) {
        return `Use at most ${SURVEY_LIMITS.maxOptions} options.`
    }
    const keys = new Set<string>()
    for (const option of options) {
        if (typeof option?.key !== "string" || option.key.trim() === "") {
            return "Every option needs a key."
        }
        if (keys.has(option.key)) {
            return "Option keys must be unique."
        }
        keys.add(option.key)
        if (typeof option.label !== "string" || option.label.trim() === "") {
            return "Every option needs a label."
        }
    }
    return null
}

/** The starter option list a freshly added choice question shows. */
function defaultOptions(): SurveyOption[] {
    return [
        { key: generateOptionKey(), label: "Option 1" },
        { key: generateOptionKey(), label: "Option 2" }
    ]
}

function optionKeys(question: SurveyQuestionDef): string[] {
    return optionsOf(question.config).map((option) => option.key)
}

function toOptionColumns(values: string[]): AnswerColumns {
    return { ...NO_COLUMNS, value_options: values }
}

function fromOptionColumns(columns: AnswerColumns): string[] | null {
    return Array.isArray(columns.value_options) ? columns.value_options : null
}

export const QUESTION_TYPE_DEFS: Record<SurveyQuestionType, QuestionTypeDef> = {
    section: {
        label: "Section header",
        description: "A heading that breaks the survey into sections.",
        hasAnswer: false,
        defaultConfig: () => ({ type: "section" }),
        validateConfig: (config) =>
            config.type === "section" ? null : "Expected a section config.",
        validateAnswer: () => "This question does not take an answer.",
        toColumns: () => ({ ...NO_COLUMNS }),
        fromColumns: () => null
    },

    yes_no: {
        label: "Yes / No",
        description: "A single yes-or-no choice.",
        hasAnswer: true,
        defaultConfig: () => ({ type: "yes_no" }),
        validateConfig: (config) =>
            config.type === "yes_no" ? null : "Expected a yes/no config.",
        validateAnswer: (_question, value) =>
            typeof value === "boolean" ? null : "Choose yes or no.",
        toColumns: (value) => ({ ...NO_COLUMNS, value_bool: value as boolean }),
        fromColumns: (columns) =>
            typeof columns.value_bool === "boolean" ? columns.value_bool : null
    },

    rating: {
        label: "Rating",
        description: "A numeric scale, such as 1 to 5 or an NPS score.",
        hasAnswer: true,
        defaultConfig: () => ({
            type: "rating",
            min: RATING_PRESETS["1-5"].min,
            max: RATING_PRESETS["1-5"].max,
            minLabel: RATING_PRESETS["1-5"].minLabel,
            maxLabel: RATING_PRESETS["1-5"].maxLabel,
            preset: "1-5"
        }),
        validateConfig: (config) => {
            if (config.type !== "rating") return "Expected a rating config."
            if (
                !Number.isInteger(config.min) ||
                !Number.isInteger(config.max)
            ) {
                return "The scale bounds must be whole numbers."
            }
            if (config.min < 0) return "The lowest value cannot be negative."
            if (config.min >= config.max) {
                return "The highest value must be above the lowest."
            }
            if (config.max - config.min > 10) {
                return "The scale can span at most 10 steps."
            }
            return null
        },
        validateAnswer: (question, value) => {
            const config = question.config
            if (config.type !== "rating") return "Expected a rating question."
            if (typeof value !== "number" || !Number.isInteger(value)) {
                return "Choose a value on the scale."
            }
            if (value < config.min || value > config.max) {
                return `Choose a value between ${config.min} and ${config.max}.`
            }
            return null
        },
        toColumns: (value) => ({
            ...NO_COLUMNS,
            value_number: value as number
        }),
        fromColumns: (columns) =>
            typeof columns.value_number === "number"
                ? columns.value_number
                : null
    },

    likert: {
        label: "Agreement scale",
        description: "A five-point strongly disagree to strongly agree scale.",
        hasAnswer: true,
        defaultConfig: () => ({
            type: "likert",
            options: LIKERT_OPTIONS.map((option) => ({ ...option }))
        }),
        validateConfig: (config) => {
            if (config.type !== "likert") return "Expected an agreement config."
            if (config.options?.length !== LIKERT_OPTIONS.length) {
                return "The agreement scale must keep its five points."
            }
            for (const [index, option] of config.options.entries()) {
                if (option.key !== LIKERT_OPTIONS[index].key) {
                    return "The agreement scale must keep its five points, in order."
                }
                if (
                    typeof option.label !== "string" ||
                    option.label.trim() === ""
                ) {
                    return "Every option needs a label."
                }
            }
            return null
        },
        validateAnswer: (question, value) => {
            if (typeof value !== "string") return "Choose one option."
            return optionKeys(question).includes(value)
                ? null
                : "Choose one of the listed options."
        },
        toColumns: (value) => toOptionColumns([value as string]),
        fromColumns: (columns) => fromOptionColumns(columns)?.[0] ?? null
    },

    single_choice: {
        label: "Single choice",
        description: "A list of options the player picks exactly one of.",
        hasAnswer: true,
        defaultConfig: () => ({
            type: "single_choice",
            options: defaultOptions()
        }),
        validateConfig: (config) =>
            config.type === "single_choice"
                ? validateOptionList(config.options)
                : "Expected a single choice config.",
        validateAnswer: (question, value) => {
            if (typeof value !== "string") return "Choose one option."
            return optionKeys(question).includes(value)
                ? null
                : "Choose one of the listed options."
        },
        toColumns: (value) => toOptionColumns([value as string]),
        fromColumns: (columns) => fromOptionColumns(columns)?.[0] ?? null
    },

    multi_choice: {
        label: "Multiple choice",
        description: "A list of options the player can pick several of.",
        hasAnswer: true,
        defaultConfig: () => ({
            type: "multi_choice",
            options: defaultOptions()
        }),
        validateConfig: (config) => {
            if (config.type !== "multi_choice") {
                return "Expected a multiple choice config."
            }
            const optionError = validateOptionList(config.options)
            if (optionError) return optionError

            const min = config.minSelections
            const max = config.maxSelections
            if (min !== undefined && (!Number.isInteger(min) || min < 0)) {
                return "The minimum number of selections must be zero or more."
            }
            if (max !== undefined && !Number.isInteger(max)) {
                return "The maximum number of selections must be a whole number."
            }
            if (max !== undefined && max > config.options.length) {
                return "The maximum number of selections cannot exceed the option count."
            }
            if (min !== undefined && max !== undefined && min > max) {
                return "The minimum number of selections cannot exceed the maximum."
            }
            return null
        },
        validateAnswer: (question, value) => {
            const config = question.config
            if (config.type !== "multi_choice") {
                return "Expected a multiple choice question."
            }
            if (!Array.isArray(value)) return "Choose one or more options."
            if (new Set(value).size !== value.length) {
                return "Each option can only be chosen once."
            }
            const keys = optionKeys(question)
            if (value.some((key) => !keys.includes(key))) {
                return "Choose from the listed options."
            }
            const min = config.minSelections
            const max = config.maxSelections
            if (min !== undefined && value.length < min) {
                return `Choose at least ${min} option${min === 1 ? "" : "s"}.`
            }
            if (max !== undefined && value.length > max) {
                return `Choose at most ${max} option${max === 1 ? "" : "s"}.`
            }
            return null
        },
        toColumns: (value) => toOptionColumns(value as string[]),
        fromColumns: (columns) => fromOptionColumns(columns)
    },

    text: {
        label: "Text",
        description: "A written answer, one line or a paragraph.",
        hasAnswer: true,
        defaultConfig: () => ({ type: "text", variant: "long" }),
        validateConfig: (config) => {
            if (config.type !== "text") return "Expected a text config."
            if (config.variant !== "short" && config.variant !== "long") {
                return "Choose a short or long text answer."
            }
            if (config.maxLength !== undefined) {
                if (
                    !Number.isInteger(config.maxLength) ||
                    config.maxLength < 1 ||
                    config.maxLength > SURVEY_LIMITS.maxTextAnswerLength
                ) {
                    return `The length limit must be between 1 and ${SURVEY_LIMITS.maxTextAnswerLength}.`
                }
            }
            return null
        },
        validateAnswer: (question, value) => {
            if (typeof value !== "string") return "Write an answer."
            const config = question.config
            const maxLength =
                (config.type === "text" ? config.maxLength : undefined) ??
                SURVEY_LIMITS.maxTextAnswerLength
            return value.trim().length > maxLength
                ? `Keep your answer to ${maxLength} characters or fewer.`
                : null
        },
        toColumns: (value) => ({ ...NO_COLUMNS, value_text: value as string }),
        fromColumns: (columns) =>
            typeof columns.value_text === "string" ? columns.value_text : null
    },

    ranking: {
        label: "Ranking",
        description: "Options the player puts in order of preference.",
        hasAnswer: true,
        defaultConfig: () => ({ type: "ranking", options: defaultOptions() }),
        validateConfig: (config) =>
            config.type === "ranking"
                ? validateOptionList(config.options)
                : "Expected a ranking config.",
        validateAnswer: (question, value) => {
            if (!Array.isArray(value)) return "Put the options in order."
            const keys = optionKeys(question)
            if (value.length !== keys.length) {
                return "Rank every option."
            }
            if (new Set(value).size !== value.length) {
                return "Each option can only appear once."
            }
            if (value.some((key) => !keys.includes(key))) {
                return "Rank only the listed options."
            }
            return null
        },
        toColumns: (value) => toOptionColumns(value as string[]),
        fromColumns: (columns) => fromOptionColumns(columns)
    }
}

/** undefined/null/blank text/empty list are empty; false and 0 are real answers. */
export function isEmptyAnswer(value: AnswerValue | null | undefined): boolean {
    if (value === null || value === undefined) return true
    if (typeof value === "string") return value.trim() === ""
    if (Array.isArray(value)) return value.length === 0
    return false
}

/** The config's option list, or [] for the types that have none. */
export function optionsOf(config: SurveyQuestionConfig): SurveyOption[] {
    return "options" in config ? config.options : []
}

/** "opt_" plus 8 random base36 characters. */
export function generateOptionKey(): string {
    let key = ""
    while (key.length < 8) {
        key += Math.random().toString(36).slice(2)
    }
    return `opt_${key.slice(0, 8)}`
}
