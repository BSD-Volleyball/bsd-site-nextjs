import { describe, expect, it } from "vitest"
import { questionsForSurvey, seriesOrderKey } from "./questions-for-survey"
import { EMPTY_VISIBILITY, type SurveyQuestionDef } from "./types"

function question(
    overrides: Partial<SurveyQuestionDef> = {}
): SurveyQuestionDef {
    return {
        id: 1,
        sortOrder: 0,
        type: "yes_no",
        prompt: "Did you enjoy the season?",
        helpText: null,
        required: true,
        config: { type: "yes_no" },
        visibility: EMPTY_VISIBILITY,
        archivedAt: null,
        ...overrides
    }
}

const active = question({ id: 1, sortOrder: 0 })
const archived = question({
    id: 2,
    sortOrder: 1,
    archivedAt: new Date("2026-01-01T00:00:00Z")
})
const addedLater = question({ id: 3, sortOrder: 2 })

describe("questionsForSurvey", () => {
    const templateQuestions = [addedLater, archived, active]

    it("uses the active template questions when there is no snapshot", () => {
        expect(
            questionsForSurvey({ questionIds: null }, templateQuestions).map(
                (q) => q.id
            )
        ).toEqual([1, 3])
    })

    it("keeps archived questions that are in the snapshot", () => {
        expect(
            questionsForSurvey({ questionIds: [2, 1] }, templateQuestions).map(
                (q) => q.id
            )
        ).toEqual([1, 2])
    })

    it("ignores questions added to the template after the snapshot", () => {
        expect(
            questionsForSurvey({ questionIds: [1, 2] }, templateQuestions).map(
                (q) => q.id
            )
        ).toEqual([1, 2])
    })

    it("returns sortOrder order, not snapshot order", () => {
        expect(
            questionsForSurvey({ questionIds: [3, 1] }, templateQuestions).map(
                (q) => q.id
            )
        ).toEqual([1, 3])
    })

    it("returns nothing for an empty snapshot", () => {
        expect(
            questionsForSurvey({ questionIds: [] }, templateQuestions)
        ).toEqual([])
    })
})

describe("seriesOrderKey", () => {
    it("prefers the season over the publish date", () => {
        expect(
            seriesOrderKey({
                seasonYear: 2025,
                seasonName: "fall",
                publishedAt: new Date("2030-06-15T12:00:00Z")
            })
        ).toBe(2025 * 12 + 9)
    })

    it("orders Fall 2025 before Spring 2026", () => {
        const fall = seriesOrderKey({
            seasonYear: 2025,
            seasonName: "fall",
            publishedAt: null
        })
        const spring = seriesOrderKey({
            seasonYear: 2026,
            seasonName: "spring",
            publishedAt: null
        })
        expect(fall).toBeLessThan(spring)
    })

    it("falls back to the publish date when there is no season", () => {
        expect(
            seriesOrderKey({
                seasonYear: null,
                seasonName: null,
                publishedAt: new Date(2026, 3, 10)
            })
        ).toBe(2026 * 12 + 4)
    })

    it("returns 0 when neither a season nor a publish date is known", () => {
        expect(
            seriesOrderKey({
                seasonYear: null,
                seasonName: null,
                publishedAt: null
            })
        ).toBe(0)
    })

    it("falls back to the publish date when the season is half-known", () => {
        expect(
            seriesOrderKey({
                seasonYear: 2026,
                seasonName: null,
                publishedAt: new Date(2026, 0, 5)
            })
        ).toBe(2026 * 12 + 1)
    })
})
