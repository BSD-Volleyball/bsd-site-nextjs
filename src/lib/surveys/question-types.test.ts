import { describe, expect, it } from "vitest"
import {
    QUESTION_TYPE_DEFS,
    generateOptionKey,
    isEmptyAnswer,
    optionsOf
} from "./question-types"
import type { AnswerColumns } from "./question-types"
import {
    LIKERT_OPTIONS,
    type SurveyOption,
    type SurveyQuestionConfig,
    type SurveyQuestionDef,
    type SurveyQuestionType,
    SURVEY_QUESTION_TYPES
} from "./types"

const CHOICES: SurveyOption[] = [
    { key: "opt_a", label: "Alpha" },
    { key: "opt_b", label: "Bravo" },
    { key: "opt_c", label: "Charlie" }
]

function question(
    type: SurveyQuestionType,
    config: SurveyQuestionConfig
): SurveyQuestionDef {
    return {
        id: 1,
        sortOrder: 0,
        type,
        prompt: "How did it go?",
        helpText: null,
        required: true,
        config,
        visibility: { conditions: [], roleTags: [] },
        archivedAt: null
    }
}

describe("QUESTION_TYPE_DEFS", () => {
    it("has an entry for every question type", () => {
        for (const type of SURVEY_QUESTION_TYPES) {
            expect(QUESTION_TYPE_DEFS[type]).toBeDefined()
            expect(QUESTION_TYPE_DEFS[type].label).toBeTruthy()
            expect(QUESTION_TYPE_DEFS[type].description).toBeTruthy()
        }
    })

    it("produces a valid default config for every type", () => {
        for (const type of SURVEY_QUESTION_TYPES) {
            const def = QUESTION_TYPE_DEFS[type]
            const config = def.defaultConfig()
            expect(config.type).toBe(type)
            expect(def.validateConfig(config)).toBeNull()
        }
    })
})

describe("section", () => {
    const def = QUESTION_TYPE_DEFS.section

    it("takes no answer", () => {
        expect(def.hasAnswer).toBe(false)
        expect(
            def.validateAnswer(question("section", { type: "section" }), "x")
        ).toBe("This question does not take an answer.")
    })

    it("stores nothing", () => {
        expect(def.toColumns("x")).toEqual({
            value_bool: null,
            value_number: null,
            value_text: null,
            value_options: null
        })
        expect(
            def.fromColumns({
                value_bool: null,
                value_number: null,
                value_text: null,
                value_options: null
            })
        ).toBeNull()
    })
})

describe("yes_no", () => {
    const def = QUESTION_TYPE_DEFS.yes_no
    const q = question("yes_no", { type: "yes_no" })

    it("validates the config", () => {
        expect(def.validateConfig({ type: "yes_no" })).toBeNull()
        expect(def.validateConfig({ type: "section" })).toBeTruthy()
    })

    it("accepts booleans only", () => {
        expect(def.validateAnswer(q, true)).toBeNull()
        expect(def.validateAnswer(q, false)).toBeNull()
        expect(def.validateAnswer(q, "yes")).toBeTruthy()
        expect(def.validateAnswer(q, 1)).toBeTruthy()
    })

    it("round trips through columns", () => {
        expect(def.fromColumns(def.toColumns(false))).toBe(false)
        expect(def.toColumns(true).value_bool).toBe(true)
    })
})

describe("rating", () => {
    const def = QUESTION_TYPE_DEFS.rating
    const q = question("rating", { type: "rating", min: 1, max: 5 })

    it("validates the config", () => {
        expect(
            def.validateConfig({ type: "rating", min: 0, max: 10 })
        ).toBeNull()
        // max - min > 10
        expect(
            def.validateConfig({ type: "rating", min: 0, max: 11 })
        ).toBeTruthy()
        // min >= max
        expect(
            def.validateConfig({ type: "rating", min: 5, max: 5 })
        ).toBeTruthy()
        // negative min
        expect(
            def.validateConfig({ type: "rating", min: -1, max: 5 })
        ).toBeTruthy()
        // non-integer bounds
        expect(
            def.validateConfig({ type: "rating", min: 1.5, max: 5 })
        ).toBeTruthy()
    })

    it("accepts integers inside the range", () => {
        expect(def.validateAnswer(q, 1)).toBeNull()
        expect(def.validateAnswer(q, 5)).toBeNull()
        expect(def.validateAnswer(q, 6)).toBeTruthy()
        expect(def.validateAnswer(q, "3")).toBeTruthy()
        expect(def.validateAnswer(q, 2.5)).toBeTruthy()
    })

    it("round trips through columns", () => {
        expect(def.fromColumns(def.toColumns(4))).toBe(4)
        expect(def.toColumns(4).value_number).toBe(4)
    })
})

describe("likert", () => {
    const def = QUESTION_TYPE_DEFS.likert
    const q = question("likert", { type: "likert", options: LIKERT_OPTIONS })

    it("validates the config", () => {
        expect(
            def.validateConfig({
                type: "likert",
                options: LIKERT_OPTIONS.map((o) => ({
                    key: o.key,
                    label: `${o.label}!`
                }))
            })
        ).toBeNull()
        // wrong order
        expect(
            def.validateConfig({
                type: "likert",
                options: [...LIKERT_OPTIONS].reverse()
            })
        ).toBeTruthy()
        // wrong keys
        expect(
            def.validateConfig({ type: "likert", options: CHOICES })
        ).toBeTruthy()
    })

    it("accepts one of the scale keys", () => {
        expect(def.validateAnswer(q, "agree")).toBeNull()
        expect(def.validateAnswer(q, "sorta_agree")).toBeTruthy()
        expect(def.validateAnswer(q, ["agree"])).toBeTruthy()
    })

    it("round trips through columns", () => {
        expect(def.toColumns("agree").value_options).toEqual(["agree"])
        expect(def.fromColumns(def.toColumns("agree"))).toBe("agree")
    })
})

describe("single_choice", () => {
    const def = QUESTION_TYPE_DEFS.single_choice
    const q = question("single_choice", {
        type: "single_choice",
        options: CHOICES
    })

    it("validates the config", () => {
        expect(
            def.validateConfig({ type: "single_choice", options: CHOICES })
        ).toBeNull()
        // fewer than two options
        expect(
            def.validateConfig({
                type: "single_choice",
                options: [CHOICES[0]]
            })
        ).toBeTruthy()
        // duplicate keys
        expect(
            def.validateConfig({
                type: "single_choice",
                options: [CHOICES[0], { key: "opt_a", label: "Again" }]
            })
        ).toBeTruthy()
        // blank label
        expect(
            def.validateConfig({
                type: "single_choice",
                options: [CHOICES[0], { key: "opt_b", label: "  " }]
            })
        ).toBeTruthy()
    })

    it("accepts an existing option key", () => {
        expect(def.validateAnswer(q, "opt_b")).toBeNull()
        expect(def.validateAnswer(q, "opt_z")).toBeTruthy()
        expect(def.validateAnswer(q, ["opt_b"])).toBeTruthy()
    })

    it("round trips through columns", () => {
        expect(def.toColumns("opt_b").value_options).toEqual(["opt_b"])
        expect(def.fromColumns(def.toColumns("opt_b"))).toBe("opt_b")
    })
})

describe("multi_choice", () => {
    const def = QUESTION_TYPE_DEFS.multi_choice
    const q = question("multi_choice", {
        type: "multi_choice",
        options: CHOICES,
        minSelections: 1,
        maxSelections: 2
    })

    it("validates the config", () => {
        expect(
            def.validateConfig({
                type: "multi_choice",
                options: CHOICES,
                minSelections: 1,
                maxSelections: 3
            })
        ).toBeNull()
        // max above the option count
        expect(
            def.validateConfig({
                type: "multi_choice",
                options: CHOICES,
                maxSelections: 4
            })
        ).toBeTruthy()
        // min above max
        expect(
            def.validateConfig({
                type: "multi_choice",
                options: CHOICES,
                minSelections: 3,
                maxSelections: 2
            })
        ).toBeTruthy()
        // duplicate keys
        expect(
            def.validateConfig({
                type: "multi_choice",
                options: [CHOICES[0], CHOICES[0]]
            })
        ).toBeTruthy()
    })

    it("accepts a bounded set of existing keys", () => {
        expect(def.validateAnswer(q, ["opt_a", "opt_c"])).toBeNull()
        // unknown key
        expect(def.validateAnswer(q, ["opt_a", "opt_z"])).toBeTruthy()
        // too many selections
        expect(def.validateAnswer(q, ["opt_a", "opt_b", "opt_c"])).toBeTruthy()
        // duplicate selection
        expect(def.validateAnswer(q, ["opt_a", "opt_a"])).toBeTruthy()
        // wrong shape
        expect(def.validateAnswer(q, "opt_a")).toBeTruthy()
    })

    it("round trips through columns", () => {
        const columns = def.toColumns(["opt_a", "opt_c"])
        expect(columns.value_options).toEqual(["opt_a", "opt_c"])
        expect(def.fromColumns(columns)).toEqual(["opt_a", "opt_c"])
    })
})

describe("text", () => {
    const def = QUESTION_TYPE_DEFS.text
    const q = question("text", {
        type: "text",
        variant: "short",
        maxLength: 10
    })

    it("validates the config", () => {
        expect(def.validateConfig({ type: "text", variant: "long" })).toBeNull()
        // maxLength out of range
        expect(
            def.validateConfig({
                type: "text",
                variant: "short",
                maxLength: 0
            })
        ).toBeTruthy()
        // unknown variant
        expect(
            def.validateConfig({
                type: "text",
                variant: "medium" as "short"
            })
        ).toBeTruthy()
    })

    it("accepts strings within the length cap", () => {
        expect(def.validateAnswer(q, "  short  ")).toBeNull()
        expect(def.validateAnswer(q, "far too long to fit")).toBeTruthy()
        expect(def.validateAnswer(q, 12)).toBeTruthy()
    })

    it("round trips through columns", () => {
        expect(def.toColumns("hello").value_text).toBe("hello")
        expect(def.fromColumns(def.toColumns("hello"))).toBe("hello")
    })
})

describe("ranking", () => {
    const def = QUESTION_TYPE_DEFS.ranking
    const q = question("ranking", { type: "ranking", options: CHOICES })

    it("validates the config", () => {
        expect(
            def.validateConfig({ type: "ranking", options: CHOICES })
        ).toBeNull()
        expect(
            def.validateConfig({ type: "ranking", options: [CHOICES[0]] })
        ).toBeTruthy()
    })

    it("accepts a full permutation of the option keys", () => {
        expect(def.validateAnswer(q, ["opt_c", "opt_a", "opt_b"])).toBeNull()
        // partial ranking
        expect(def.validateAnswer(q, ["opt_c", "opt_a"])).toBeTruthy()
        // unknown key
        expect(def.validateAnswer(q, ["opt_c", "opt_a", "opt_z"])).toBeTruthy()
        // wrong shape
        expect(def.validateAnswer(q, "opt_a")).toBeTruthy()
    })

    it("round trips through columns", () => {
        const columns = def.toColumns(["opt_c", "opt_a", "opt_b"])
        expect(columns.value_options).toEqual(["opt_c", "opt_a", "opt_b"])
        expect(def.fromColumns(columns)).toEqual(["opt_c", "opt_a", "opt_b"])
    })
})

describe("fromColumns", () => {
    const empty: AnswerColumns = {
        value_bool: null,
        value_number: null,
        value_text: null,
        value_options: null
    }

    it("returns null when the stored column is empty", () => {
        expect(QUESTION_TYPE_DEFS.yes_no.fromColumns(empty)).toBeNull()
        expect(QUESTION_TYPE_DEFS.rating.fromColumns(empty)).toBeNull()
        expect(QUESTION_TYPE_DEFS.text.fromColumns(empty)).toBeNull()
        expect(QUESTION_TYPE_DEFS.single_choice.fromColumns(empty)).toBeNull()
        expect(QUESTION_TYPE_DEFS.multi_choice.fromColumns(empty)).toBeNull()
    })
})

describe("isEmptyAnswer", () => {
    it("treats missing, blank and empty list answers as empty", () => {
        expect(isEmptyAnswer(undefined)).toBe(true)
        expect(isEmptyAnswer(null)).toBe(true)
        expect(isEmptyAnswer("")).toBe(true)
        expect(isEmptyAnswer("  ")).toBe(true)
        expect(isEmptyAnswer([])).toBe(true)
    })

    it("treats false and zero as real answers", () => {
        expect(isEmptyAnswer(false)).toBe(false)
        expect(isEmptyAnswer(0)).toBe(false)
        expect(isEmptyAnswer("no")).toBe(false)
        expect(isEmptyAnswer(["opt_a"])).toBe(false)
    })
})

describe("optionsOf", () => {
    it("returns the configured options", () => {
        expect(optionsOf({ type: "single_choice", options: CHOICES })).toEqual(
            CHOICES
        )
        expect(optionsOf({ type: "likert", options: LIKERT_OPTIONS })).toEqual(
            LIKERT_OPTIONS
        )
    })

    it("returns an empty list for types without options", () => {
        expect(optionsOf({ type: "yes_no" })).toEqual([])
        expect(optionsOf({ type: "section" })).toEqual([])
        expect(optionsOf({ type: "rating", min: 1, max: 5 })).toEqual([])
        expect(optionsOf({ type: "text", variant: "short" })).toEqual([])
    })
})

describe("generateOptionKey", () => {
    it("returns an opt_ prefixed key", () => {
        expect(generateOptionKey()).toMatch(/^opt_[a-z0-9]{8}$/)
    })

    it("does not repeat itself", () => {
        const keys = new Set(
            Array.from({ length: 50 }, () => generateOptionKey())
        )
        expect(keys.size).toBe(50)
    })
})
