import { describe, expect, it } from "vitest"
import {
    type AnswerMap,
    LIKERT_OPTIONS,
    type SurveyOption,
    type SurveyQuestionConfig,
    type SurveyQuestionDef,
    type SurveyQuestionType,
    type SurveyRoleTag
} from "./types"
import {
    conditionMatches,
    evaluateVisibility,
    validateVisibilityGraph
} from "./visibility"

const CHOICES: SurveyOption[] = [
    { key: "opt_a", label: "Alpha" },
    { key: "opt_b", label: "Bravo" },
    { key: "opt_c", label: "Charlie" }
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

function visible(
    questions: SurveyQuestionDef[],
    answers: AnswerMap = {},
    roleTags: SurveyRoleTag[] = []
): number[] {
    return [...evaluateVisibility({ questions, answers, roleTags })].sort(
        (a, b) => a - b
    )
}

describe("conditionMatches", () => {
    const yesNo = q(1, "yes_no", { type: "yes_no" })
    const choice = q(1, "single_choice", {
        type: "single_choice",
        options: CHOICES
    })
    const rating = q(1, "rating", { type: "rating", min: 1, max: 5 })

    it("compares yes_no answers to the strings yes and no", () => {
        const wantsYes = {
            questionId: 1,
            operator: "in" as const,
            values: ["yes"]
        }
        expect(conditionMatches(wantsYes, yesNo, true)).toBe(true)
        expect(conditionMatches(wantsYes, yesNo, false)).toBe(false)

        const wantsNo = {
            questionId: 1,
            operator: "in" as const,
            values: ["no"]
        }
        expect(conditionMatches(wantsNo, yesNo, false)).toBe(true)
    })

    it("is false for an unanswered dependency under either list operator", () => {
        expect(
            conditionMatches(
                { questionId: 1, operator: "in", values: ["opt_a"] },
                choice,
                undefined
            )
        ).toBe(false)
        expect(
            conditionMatches(
                { questionId: 1, operator: "not_in", values: ["opt_a"] },
                choice,
                undefined
            )
        ).toBe(false)
    })

    it("is false when the dependency type cannot serve the operator", () => {
        const text = q(1, "text", { type: "text", variant: "short" })
        expect(
            conditionMatches(
                { questionId: 1, operator: "in", values: ["anything"] },
                text,
                "anything"
            )
        ).toBe(false)
        expect(
            conditionMatches(
                { questionId: 1, operator: "gte", value: 3 },
                choice,
                "opt_a"
            )
        ).toBe(false)
    })

    it("compares rating answers with eq, gte and lte", () => {
        expect(
            conditionMatches(
                { questionId: 1, operator: "eq", value: 3 },
                rating,
                3
            )
        ).toBe(true)
        expect(
            conditionMatches(
                { questionId: 1, operator: "gte", value: 4 },
                rating,
                3
            )
        ).toBe(false)
        expect(
            conditionMatches(
                { questionId: 1, operator: "lte", value: 4 },
                rating,
                3
            )
        ).toBe(true)
    })
})

describe("evaluateVisibility role tags", () => {
    const questions = [
        q(1, "text", { type: "text", variant: "short" }),
        q(
            2,
            "text",
            { type: "text", variant: "short" },
            {
                visibility: { conditions: [], roleTags: ["captain"] }
            }
        )
    ]

    it("hides a captain-only question from a player who is not a captain", () => {
        expect(visible(questions, {}, ["rostered"])).toEqual([1])
    })

    it("shows a captain-only question when any listed tag matches", () => {
        expect(visible(questions, {}, ["rostered", "captain"])).toEqual([1, 2])
    })
})

describe("evaluateVisibility conditions", () => {
    it("matches an in condition on a single_choice answer", () => {
        const questions = [
            q(1, "single_choice", {
                type: "single_choice",
                options: CHOICES
            }),
            q(
                2,
                "text",
                { type: "text", variant: "short" },
                {
                    visibility: {
                        conditions: [
                            { questionId: 1, operator: "in", values: ["opt_b"] }
                        ],
                        roleTags: []
                    }
                }
            )
        ]
        expect(visible(questions, { 1: "opt_b" })).toEqual([1, 2])
        expect(visible(questions, { 1: "opt_a" })).toEqual([1])
    })

    it("matches a not_in condition as the negation of in", () => {
        const questions = [
            q(1, "single_choice", {
                type: "single_choice",
                options: CHOICES
            }),
            q(
                2,
                "text",
                { type: "text", variant: "short" },
                {
                    visibility: {
                        conditions: [
                            {
                                questionId: 1,
                                operator: "not_in",
                                values: ["opt_b"]
                            }
                        ],
                        roleTags: []
                    }
                }
            )
        ]
        expect(visible(questions, { 1: "opt_a" })).toEqual([1, 2])
        expect(visible(questions, { 1: "opt_b" })).toEqual([1])
    })

    it("matches a gte condition on a rating answer", () => {
        const questions = [
            q(1, "rating", { type: "rating", min: 1, max: 5 }),
            q(
                2,
                "text",
                { type: "text", variant: "short" },
                {
                    visibility: {
                        conditions: [
                            { questionId: 1, operator: "gte", value: 4 }
                        ],
                        roleTags: []
                    }
                }
            )
        ]
        expect(visible(questions, { 1: 5 })).toEqual([1, 2])
        expect(visible(questions, { 1: 3 })).toEqual([1])
    })

    it("matches an in condition on a multi_choice answer when any selection matches", () => {
        const questions = [
            q(1, "multi_choice", { type: "multi_choice", options: CHOICES }),
            q(
                2,
                "text",
                { type: "text", variant: "short" },
                {
                    visibility: {
                        conditions: [
                            { questionId: 1, operator: "in", values: ["opt_c"] }
                        ],
                        roleTags: []
                    }
                }
            )
        ]
        expect(visible(questions, { 1: ["opt_a", "opt_c"] })).toEqual([1, 2])
        expect(visible(questions, { 1: ["opt_a", "opt_b"] })).toEqual([1])
    })

    it("matches a ranking condition against the first-place option only", () => {
        const questions = [
            q(1, "ranking", { type: "ranking", options: CHOICES }),
            q(
                2,
                "text",
                { type: "text", variant: "short" },
                {
                    visibility: {
                        conditions: [
                            { questionId: 1, operator: "in", values: ["opt_a"] }
                        ],
                        roleTags: []
                    }
                }
            )
        ]
        expect(visible(questions, { 1: ["opt_a", "opt_b", "opt_c"] })).toEqual([
            1, 2
        ])
        expect(visible(questions, { 1: ["opt_b", "opt_a", "opt_c"] })).toEqual([
            1
        ])
    })

    it("hides a child whose parent is unanswered", () => {
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
        expect(visible(questions, {})).toEqual([1])
        expect(visible(questions, { 1: true })).toEqual([1, 2])
    })

    it("hides a grandchild when the grandparent is hidden, even if the parent is answered", () => {
        const questions = [
            q(
                1,
                "yes_no",
                { type: "yes_no" },
                {
                    visibility: { conditions: [], roleTags: ["captain"] }
                }
            ),
            q(
                2,
                "yes_no",
                { type: "yes_no" },
                {
                    visibility: {
                        conditions: [
                            { questionId: 1, operator: "in", values: ["yes"] }
                        ],
                        roleTags: []
                    }
                }
            ),
            q(
                3,
                "text",
                { type: "text", variant: "short" },
                {
                    visibility: {
                        conditions: [
                            { questionId: 2, operator: "in", values: ["yes"] }
                        ],
                        roleTags: []
                    }
                }
            )
        ]
        const answers: AnswerMap = { 1: true, 2: true }
        expect(visible(questions, answers, ["captain"])).toEqual([1, 2, 3])
        expect(visible(questions, answers, ["rostered"])).toEqual([])
    })

    it("never shows an archived question and hides anything depending on it", () => {
        const questions = [
            q(
                1,
                "yes_no",
                { type: "yes_no" },
                {
                    archivedAt: new Date("2026-01-01")
                }
            ),
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
        expect(visible(questions, { 1: true })).toEqual([])
    })

    it("resolves dependencies by sort order, not array order", () => {
        const questions = [
            q(
                2,
                "text",
                { type: "text", variant: "short" },
                {
                    sortOrder: 1,
                    visibility: {
                        conditions: [
                            { questionId: 1, operator: "in", values: ["yes"] }
                        ],
                        roleTags: []
                    }
                }
            ),
            q(1, "yes_no", { type: "yes_no" }, { sortOrder: 0 })
        ]
        expect(visible(questions, { 1: true })).toEqual([1, 2])
    })

    it("shows a section that passes its role gate and hides one that does not", () => {
        const questions = [
            q(
                1,
                "section",
                { type: "section" },
                {
                    visibility: { conditions: [], roleTags: ["captain"] }
                }
            )
        ]
        expect(visible(questions, {}, ["captain"])).toEqual([1])
        expect(visible(questions, {}, [])).toEqual([])
    })

    it("hides a question that depends on a section, which takes no answer", () => {
        const questions = [
            q(1, "section", { type: "section" }),
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
        expect(visible(questions, {})).toEqual([1])
    })
})

describe("validateVisibilityGraph", () => {
    it("accepts a well-formed graph", () => {
        const questions = [
            q(1, "rating", { type: "rating", min: 1, max: 5 }),
            q(
                2,
                "likert",
                { type: "likert", options: LIKERT_OPTIONS },
                {
                    visibility: {
                        conditions: [
                            { questionId: 1, operator: "lte", value: 2 }
                        ],
                        roleTags: []
                    }
                }
            ),
            q(
                3,
                "text",
                { type: "text", variant: "long" },
                {
                    visibility: {
                        conditions: [
                            {
                                questionId: 2,
                                operator: "not_in",
                                values: ["agree", "strongly_agree"]
                            }
                        ],
                        roleTags: ["captain"]
                    }
                }
            )
        ]
        expect(validateVisibilityGraph(questions)).toEqual([])
    })

    it("rejects a dependency that does not exist", () => {
        const questions = [
            q(
                1,
                "text",
                { type: "text", variant: "short" },
                {
                    visibility: {
                        conditions: [
                            { questionId: 99, operator: "in", values: ["yes"] }
                        ],
                        roleTags: []
                    }
                }
            )
        ]
        const errors = validateVisibilityGraph(questions)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatch(/no longer exists/)
    })

    it("rejects a forward reference", () => {
        const questions = [
            q(
                1,
                "text",
                { type: "text", variant: "short" },
                {
                    visibility: {
                        conditions: [
                            { questionId: 2, operator: "in", values: ["yes"] }
                        ],
                        roleTags: []
                    }
                }
            ),
            q(2, "yes_no", { type: "yes_no" })
        ]
        const errors = validateVisibilityGraph(questions)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatch(/comes before it/)
    })

    it("rejects a self reference", () => {
        const questions = [
            q(
                1,
                "yes_no",
                { type: "yes_no" },
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
        const errors = validateVisibilityGraph(questions)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatch(/cannot depend on itself/)
    })

    it("rejects a dependency on an archived question", () => {
        const questions = [
            q(
                1,
                "yes_no",
                { type: "yes_no" },
                {
                    archivedAt: new Date("2026-01-01")
                }
            ),
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
        const errors = validateVisibilityGraph(questions)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatch(/archived/)
    })

    it("rejects an operator the dependency type cannot serve", () => {
        const questions = [
            q(1, "text", { type: "text", variant: "short" }),
            q(2, "rating", { type: "rating", min: 1, max: 5 }),
            q(
                3,
                "text",
                { type: "text", variant: "short" },
                {
                    visibility: {
                        conditions: [
                            { questionId: 1, operator: "in", values: ["yes"] },
                            { questionId: 2, operator: "in", values: ["yes"] }
                        ],
                        roleTags: []
                    }
                }
            ),
            q(
                4,
                "text",
                { type: "text", variant: "short" },
                {
                    visibility: {
                        conditions: [
                            { questionId: 1, operator: "gte", value: 3 }
                        ],
                        roleTags: []
                    }
                }
            )
        ]
        const errors = validateVisibilityGraph(questions)
        expect(errors).toHaveLength(3)
        expect(errors.filter((e) => /options/.test(e))).toHaveLength(2)
        expect(errors.filter((e) => /rating question/.test(e))).toHaveLength(1)
    })

    it("rejects an option key the dependency no longer offers", () => {
        const questions = [
            q(1, "single_choice", {
                type: "single_choice",
                options: CHOICES
            }),
            q(2, "yes_no", { type: "yes_no" }),
            q(
                3,
                "text",
                { type: "text", variant: "short" },
                {
                    visibility: {
                        conditions: [
                            {
                                questionId: 1,
                                operator: "in",
                                values: ["opt_gone"]
                            },
                            { questionId: 2, operator: "in", values: ["maybe"] }
                        ],
                        roleTags: []
                    }
                }
            )
        ]
        const errors = validateVisibilityGraph(questions)
        expect(errors).toHaveLength(2)
        expect(errors.filter((e) => /option/.test(e))).toHaveLength(1)
        expect(errors.filter((e) => /yes or no/.test(e))).toHaveLength(1)
    })

    it("rejects a rating value outside the scale", () => {
        const questions = [
            q(1, "rating", { type: "rating", min: 1, max: 5 }),
            q(
                2,
                "text",
                { type: "text", variant: "short" },
                {
                    visibility: {
                        conditions: [
                            { questionId: 1, operator: "gte", value: 9 }
                        ],
                        roleTags: []
                    }
                }
            )
        ]
        const errors = validateVisibilityGraph(questions)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatch(/between 1 and 5/)
    })

    it("rejects a cycle between two questions", () => {
        const questions = [
            q(
                1,
                "yes_no",
                { type: "yes_no" },
                {
                    visibility: {
                        conditions: [
                            { questionId: 2, operator: "in", values: ["yes"] }
                        ],
                        roleTags: []
                    }
                }
            ),
            q(
                2,
                "yes_no",
                { type: "yes_no" },
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
        const errors = validateVisibilityGraph(questions)
        expect(errors.filter((e) => /loop/.test(e))).toHaveLength(1)
    })
})
