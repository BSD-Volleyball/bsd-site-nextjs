import { describe, expect, it } from "vitest"
import { REQUIRED_MESSAGE, validateSubmission } from "./validate-submission"
import type {
    AnswerMap,
    SurveyOption,
    SurveyQuestionConfig,
    SurveyQuestionDef,
    SurveyQuestionType,
    SurveyRoleTag
} from "./types"

const CHOICES: SurveyOption[] = [
    { key: "opt_a", label: "Alpha" },
    { key: "opt_b", label: "Bravo" }
]

function q(
    id: number,
    type: SurveyQuestionType,
    config: SurveyQuestionConfig,
    extras?: Partial<SurveyQuestionDef>
): SurveyQuestionDef {
    return {
        id,
        sortOrder: id,
        type,
        prompt: `Question ${id}`,
        helpText: null,
        required: false,
        config,
        visibility: { conditions: [], roleTags: [] },
        archivedAt: null,
        ...extras
    }
}

function run(
    questions: SurveyQuestionDef[],
    answers: AnswerMap,
    mode: "draft" | "submit" = "submit",
    roleTags: SurveyRoleTag[] = []
) {
    return validateSubmission({ questions, answers, roleTags, mode })
}

describe("validateSubmission", () => {
    it("keeps valid answers to visible questions", () => {
        const questions = [
            q(1, "yes_no", { type: "yes_no" }),
            q(2, "single_choice", { type: "single_choice", options: CHOICES })
        ]
        const result = run(questions, { 1: false, 2: "opt_a" })
        expect(result.errors).toEqual({})
        expect(result.cleaned).toEqual({ 1: false, 2: "opt_a" })
        expect([...result.visible]).toEqual([1, 2])
    })

    it("strips answers to hidden questions", () => {
        const questions = [
            q(1, "yes_no", { type: "yes_no" }),
            q(
                2,
                "text",
                { type: "text", variant: "short" },
                {
                    visibility: {
                        conditions: [
                            { questionId: 1, operator: "in", values: ["yes"] }
                        ],
                        roleTags: []
                    }
                }
            )
        ]
        const result = run(questions, { 1: false, 2: "sneaky" })
        expect(result.cleaned).toEqual({ 1: false })
        expect(result.errors).toEqual({})
    })

    it("strips answers to unknown, archived and section questions", () => {
        const questions = [
            q(1, "section", { type: "section" }),
            q(
                2,
                "yes_no",
                { type: "yes_no" },
                {
                    archivedAt: new Date("2026-01-01")
                }
            ),
            q(3, "yes_no", { type: "yes_no" })
        ]
        const result = run(questions, {
            1: "heading",
            2: true,
            3: true,
            404: "nobody asked"
        })
        expect(result.cleaned).toEqual({ 3: true })
        expect(result.errors).toEqual({})
    })

    it("reports an invalid answer and keeps it out of the cleaned map", () => {
        const questions = [
            q(1, "rating", { type: "rating", min: 1, max: 5 }),
            q(2, "single_choice", { type: "single_choice", options: CHOICES })
        ]
        const result = run(questions, { 1: 9, 2: "opt_missing" })
        expect(result.cleaned).toEqual({})
        expect(result.errors[1]).toMatch(/between 1 and 5/)
        expect(result.errors[2]).toBeTruthy()
    })

    it("reports invalid answers in draft mode too, and never persists them", () => {
        const questions = [q(1, "rating", { type: "rating", min: 1, max: 5 })]
        const result = run(questions, { 1: 9 }, "draft")
        expect(result.cleaned).toEqual({})
        expect(result.errors[1]).toMatch(/between 1 and 5/)
    })

    it("enforces required questions only in submit mode", () => {
        const questions = [
            q(1, "text", { type: "text", variant: "short" }, { required: true })
        ]
        expect(run(questions, {}, "draft").errors).toEqual({})
        expect(run(questions, {}, "submit").errors).toEqual({
            1: "This question is required."
        })
    })

    it("treats a blank answer to a required question as missing", () => {
        const questions = [
            q(
                1,
                "text",
                { type: "text", variant: "short" },
                { required: true }
            ),
            q(
                2,
                "multi_choice",
                { type: "multi_choice", options: CHOICES },
                {
                    required: true
                }
            )
        ]
        const result = run(questions, { 1: "   ", 2: [] })
        expect(result.cleaned).toEqual({})
        expect(result.errors[1]).toBe("This question is required.")
        expect(result.errors[2]).toBe("This question is required.")
    })

    it("does not require a hidden question", () => {
        const questions = [
            q(1, "yes_no", { type: "yes_no" }),
            q(
                2,
                "text",
                { type: "text", variant: "short" },
                {
                    required: true,
                    visibility: {
                        conditions: [
                            { questionId: 1, operator: "in", values: ["yes"] }
                        ],
                        roleTags: []
                    }
                }
            )
        ]
        expect(run(questions, { 1: false }).errors).toEqual({})
        expect(run(questions, { 1: true }).errors).toEqual({
            2: "This question is required."
        })
    })

    it("does not require a section header", () => {
        const questions = [
            q(1, "section", { type: "section" }, { required: true })
        ]
        expect(run(questions, {}).errors).toEqual({})
    })

    it("keeps the validation error rather than the required message", () => {
        const questions = [
            q(
                1,
                "rating",
                { type: "rating", min: 1, max: 5 },
                {
                    required: true
                }
            )
        ]
        const result = run(questions, { 1: 9 })
        expect(result.errors[1]).toMatch(/between 1 and 5/)
    })

    // The contract behind RankingInput's seeding effect: a required ranking
    // is only satisfied by a full permutation of its option keys, and an
    // untouched question (no answer at all) fails. Nothing about the default
    // order the component shows makes it an answer — the component has to
    // emit it.
    it("accepts a full permutation for a required ranking", () => {
        const questions = [
            q(
                1,
                "ranking",
                { type: "ranking", options: CHOICES },
                { required: true }
            )
        ]
        const result = run(questions, { 1: ["opt_b", "opt_a"] })
        expect(result.errors).toEqual({})
        expect(result.cleaned).toEqual({ 1: ["opt_b", "opt_a"] })
    })

    it("fails a required ranking that was never answered", () => {
        const questions = [
            q(
                1,
                "ranking",
                { type: "ranking", options: CHOICES },
                { required: true }
            )
        ]
        const result = run(questions, {})
        expect(result.errors[1]).toBe(REQUIRED_MESSAGE)
        expect(result.cleaned).toEqual({})
    })

    it("honours role tags when deciding what is visible", () => {
        const questions = [
            q(
                1,
                "text",
                { type: "text", variant: "short" },
                {
                    required: true,
                    visibility: { conditions: [], roleTags: ["captain"] }
                }
            )
        ]
        expect(run(questions, { 1: "hi" }, "submit", ["rostered"])).toEqual({
            visible: new Set<number>(),
            cleaned: {},
            errors: {}
        })
        expect(
            run(questions, { 1: "hi" }, "submit", ["captain"]).cleaned
        ).toEqual({ 1: "hi" })
    })
})
