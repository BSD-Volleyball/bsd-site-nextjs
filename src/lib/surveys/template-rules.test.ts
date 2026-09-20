import { describe, expect, it } from "vitest"
import {
    canArchiveQuestion,
    type TemplateQuestionInput,
    validateQuestionUpdate
} from "./template-rules"
import {
    EMPTY_VISIBILITY,
    LIKERT_OPTIONS,
    type SurveyQuestionDef,
    type SurveyVisibility
} from "./types"

function question(
    overrides: Partial<SurveyQuestionDef> = {}
): SurveyQuestionDef {
    return {
        id: 1,
        sortOrder: 0,
        type: "single_choice",
        prompt: "Which night works best?",
        helpText: null,
        required: true,
        config: {
            type: "single_choice",
            options: [
                { key: "opt_a", label: "Monday" },
                { key: "opt_b", label: "Tuesday" }
            ]
        },
        visibility: EMPTY_VISIBILITY,
        archivedAt: null,
        ...overrides
    }
}

function inputFrom(
    existing: SurveyQuestionDef,
    overrides: Partial<TemplateQuestionInput> = {}
): TemplateQuestionInput {
    return {
        id: existing.id,
        type: existing.type,
        prompt: existing.prompt,
        helpText: existing.helpText,
        required: existing.required,
        config: existing.config,
        visibility: existing.visibility,
        ...overrides
    }
}

describe("validateQuestionUpdate — config must match the type", () => {
    it("rejects a config whose type disagrees with the question type", () => {
        const existing = question({
            type: "rating",
            config: { type: "rating", min: 1, max: 5 }
        })
        // Crafted payload: the type still says "rating", so the type check
        // passes, but the config is a choice config and would slip past every
        // lock branch that keys off config.type.
        const incoming = inputFrom(existing, {
            type: "rating",
            config: {
                type: "single_choice",
                options: [
                    { key: "opt_a", label: "Yes" },
                    { key: "opt_b", label: "No" }
                ]
            }
        })
        expect(validateQuestionUpdate(existing, incoming, true)).toMatch(
            /config/i
        )
    })

    it("rejects the mismatch even when the question has no answers", () => {
        const existing = question({
            type: "text",
            config: { type: "text", variant: "short" }
        })
        const incoming = inputFrom(existing, {
            type: "text",
            config: { type: "yes_no" }
        })
        expect(validateQuestionUpdate(existing, incoming, false)).toMatch(
            /config/i
        )
    })
})

describe("validateQuestionUpdate — locked (has answers)", () => {
    it("rejects a type change", () => {
        const existing = question()
        const incoming = inputFrom(existing, {
            type: "multi_choice",
            config: {
                type: "multi_choice",
                options: [
                    { key: "opt_a", label: "Monday" },
                    { key: "opt_b", label: "Tuesday" }
                ]
            }
        })
        expect(validateQuestionUpdate(existing, incoming, true)).toMatch(
            /type/i
        )
    })

    it("rejects a rating min or max change", () => {
        const existing = question({
            type: "rating",
            config: { type: "rating", min: 1, max: 5 }
        })

        expect(
            validateQuestionUpdate(
                existing,
                inputFrom(existing, {
                    config: { type: "rating", min: 0, max: 5 }
                }),
                true
            )
        ).toMatch(/scale/i)

        expect(
            validateQuestionUpdate(
                existing,
                inputFrom(existing, {
                    config: { type: "rating", min: 1, max: 10 }
                }),
                true
            )
        ).toMatch(/scale/i)
    })

    it("allows rating end labels to change", () => {
        const existing = question({
            type: "rating",
            config: { type: "rating", min: 1, max: 5, minLabel: "Poor" }
        })
        const incoming = inputFrom(existing, {
            config: {
                type: "rating",
                min: 1,
                max: 5,
                minLabel: "Awful",
                maxLabel: "Great"
            }
        })
        expect(validateQuestionUpdate(existing, incoming, true)).toBeNull()
    })

    it("rejects removing an option", () => {
        const existing = question()
        const incoming = inputFrom(existing, {
            config: {
                type: "single_choice",
                options: [{ key: "opt_a", label: "Monday" }]
            }
        })
        expect(validateQuestionUpdate(existing, incoming, true)).toMatch(
            /remove/i
        )
    })

    it("rejects re-keying an option", () => {
        const existing = question()
        const incoming = inputFrom(existing, {
            config: {
                type: "single_choice",
                options: [
                    { key: "opt_a", label: "Monday" },
                    { key: "opt_new", label: "Tuesday" }
                ]
            }
        })
        expect(validateQuestionUpdate(existing, incoming, true)).not.toBeNull()
    })

    it("rejects reordering existing options", () => {
        const existing = question()
        const incoming = inputFrom(existing, {
            config: {
                type: "single_choice",
                options: [
                    { key: "opt_b", label: "Tuesday" },
                    { key: "opt_a", label: "Monday" }
                ]
            }
        })
        expect(validateQuestionUpdate(existing, incoming, true)).not.toBeNull()
    })

    it("allows relabelling an option and appending new ones", () => {
        const existing = question()
        const incoming = inputFrom(existing, {
            config: {
                type: "single_choice",
                options: [
                    { key: "opt_a", label: "Monday nights" },
                    { key: "opt_b", label: "Tuesday" },
                    { key: "opt_c", label: "Wednesday" }
                ]
            }
        })
        expect(validateQuestionUpdate(existing, incoming, true)).toBeNull()
    })

    it("allows prompt, help text, required and visibility edits", () => {
        const existing = question()
        const visibility: SurveyVisibility = {
            conditions: [{ questionId: 7, operator: "in", values: ["yes"] }],
            roleTags: ["captain"]
        }
        const incoming = inputFrom(existing, {
            prompt: "Which night suits you best?",
            helpText: "Pick the one you would attend.",
            required: false,
            visibility
        })
        expect(validateQuestionUpdate(existing, incoming, true)).toBeNull()
    })

    it("allows relabelling a likert option but not re-keying one", () => {
        const existing = question({
            type: "likert",
            config: {
                type: "likert",
                options: LIKERT_OPTIONS.map((option) => ({ ...option }))
            }
        })

        const relabelled = inputFrom(existing, {
            config: {
                type: "likert",
                options: LIKERT_OPTIONS.map((option, index) =>
                    index === 0
                        ? { ...option, label: "Really disagree" }
                        : option
                )
            }
        })
        expect(validateQuestionUpdate(existing, relabelled, true)).toBeNull()

        const rekeyed = inputFrom(existing, {
            config: {
                type: "likert",
                options: LIKERT_OPTIONS.map((option, index) =>
                    index === 0 ? { ...option, key: "hates_it" } : option
                )
            }
        })
        expect(validateQuestionUpdate(existing, rekeyed, true)).not.toBeNull()
    })

    it("rejects a multi_choice selection bound change", () => {
        const existing = question({
            type: "multi_choice",
            config: {
                type: "multi_choice",
                options: [
                    { key: "opt_a", label: "Monday" },
                    { key: "opt_b", label: "Tuesday" }
                ],
                minSelections: 1,
                maxSelections: 2
            }
        })

        expect(
            validateQuestionUpdate(
                existing,
                inputFrom(existing, {
                    config: {
                        type: "multi_choice",
                        options: [
                            { key: "opt_a", label: "Monday" },
                            { key: "opt_b", label: "Tuesday" }
                        ],
                        minSelections: 2,
                        maxSelections: 2
                    }
                }),
                true
            )
        ).toMatch(/selections/i)

        expect(
            validateQuestionUpdate(
                existing,
                inputFrom(existing, {
                    config: {
                        type: "multi_choice",
                        options: [
                            { key: "opt_a", label: "Monday" },
                            { key: "opt_b", label: "Tuesday" }
                        ],
                        minSelections: 1,
                        maxSelections: 1
                    }
                }),
                true
            )
        ).toMatch(/selections/i)
    })

    it("allows a multi_choice edit that keeps both selection bounds", () => {
        const existing = question({
            type: "multi_choice",
            config: {
                type: "multi_choice",
                options: [
                    { key: "opt_a", label: "Monday" },
                    { key: "opt_b", label: "Tuesday" }
                ],
                minSelections: 1,
                maxSelections: 2
            }
        })
        const incoming = inputFrom(existing, {
            config: {
                type: "multi_choice",
                options: [
                    { key: "opt_a", label: "Monday nights" },
                    { key: "opt_b", label: "Tuesday" },
                    { key: "opt_c", label: "Wednesday" }
                ],
                minSelections: 1,
                maxSelections: 2
            }
        })
        expect(validateQuestionUpdate(existing, incoming, true)).toBeNull()
    })

    it("allows text variant and length limit edits", () => {
        const existing = question({
            type: "text",
            config: { type: "text", variant: "short" }
        })
        const incoming = inputFrom(existing, {
            config: { type: "text", variant: "long", maxLength: 500 }
        })
        expect(validateQuestionUpdate(existing, incoming, true)).toBeNull()
    })
})

describe("validateQuestionUpdate — unlocked (no answers)", () => {
    it("allows multi_choice selection bounds to change", () => {
        const existing = question({
            type: "multi_choice",
            config: {
                type: "multi_choice",
                options: [
                    { key: "opt_a", label: "Monday" },
                    { key: "opt_b", label: "Tuesday" }
                ],
                minSelections: 1,
                maxSelections: 2
            }
        })
        const incoming = inputFrom(existing, {
            config: {
                type: "multi_choice",
                options: [
                    { key: "opt_a", label: "Monday" },
                    { key: "opt_b", label: "Tuesday" }
                ],
                minSelections: 2,
                maxSelections: 2
            }
        })
        expect(validateQuestionUpdate(existing, incoming, false)).toBeNull()
    })

    it("allows a type change, a scale change and option removal", () => {
        const existing = question({
            type: "rating",
            config: { type: "rating", min: 1, max: 5 }
        })

        expect(
            validateQuestionUpdate(
                existing,
                inputFrom(existing, {
                    config: { type: "rating", min: 0, max: 10 }
                }),
                false
            )
        ).toBeNull()

        expect(
            validateQuestionUpdate(
                existing,
                inputFrom(existing, {
                    type: "single_choice",
                    config: {
                        type: "single_choice",
                        options: [
                            { key: "opt_z", label: "Yes" },
                            { key: "opt_y", label: "No" }
                        ]
                    }
                }),
                false
            )
        ).toBeNull()
    })
})

describe("canArchiveQuestion", () => {
    const parent = question({ id: 1, sortOrder: 0, type: "yes_no" })

    it("refuses when another active question depends on it", () => {
        const child = question({
            id: 2,
            sortOrder: 1,
            visibility: {
                conditions: [
                    { questionId: 1, operator: "in", values: ["yes"] }
                ],
                roleTags: []
            }
        })
        expect(canArchiveQuestion(1, [parent, child])).not.toBeNull()
    })

    it("allows when the dependent question is itself archived", () => {
        const child = question({
            id: 2,
            sortOrder: 1,
            archivedAt: new Date("2026-01-01T00:00:00Z"),
            visibility: {
                conditions: [{ questionId: 1, operator: "gte", value: 3 }],
                roleTags: []
            }
        })
        expect(canArchiveQuestion(1, [parent, child])).toBeNull()
    })

    it("ignores the question's own conditions and unrelated ones", () => {
        const selfReferencing = question({
            id: 1,
            visibility: {
                conditions: [
                    { questionId: 1, operator: "in", values: ["yes"] }
                ],
                roleTags: []
            }
        })
        const unrelated = question({
            id: 2,
            visibility: {
                conditions: [
                    { questionId: 9, operator: "in", values: ["yes"] }
                ],
                roleTags: []
            }
        })
        expect(canArchiveQuestion(1, [selfReferencing, unrelated])).toBeNull()
    })

    it("allows when nothing depends on it", () => {
        expect(canArchiveQuestion(1, [parent, question({ id: 2 })])).toBeNull()
    })
})
