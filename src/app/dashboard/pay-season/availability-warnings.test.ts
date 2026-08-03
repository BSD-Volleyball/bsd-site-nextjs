import { describe, expect, it } from "vitest"
import {
    MANY_MISSED_DATES_THRESHOLD,
    isMissingAllPlayoffs,
    isMissingAllTryouts,
    isMissingManyDates
} from "./availability-warnings"

const events = (...ids: number[]) => ids.map((id) => ({ id }))

describe("isMissingAllTryouts", () => {
    it("is true when every tryout date is marked unavailable", () => {
        expect(isMissingAllTryouts(events(1, 2, 3), new Set([1, 2, 3]))).toBe(
            true
        )
    })

    it("is false when at least one tryout date is still available", () => {
        expect(isMissingAllTryouts(events(1, 2, 3), new Set([1, 2]))).toBe(
            false
        )
    })

    it("is false when the season has no tryout dates", () => {
        expect(isMissingAllTryouts([], new Set([1, 2, 3]))).toBe(false)
    })
})

describe("isMissingManyDates", () => {
    it(`is true at the ${MANY_MISSED_DATES_THRESHOLD}-date threshold`, () => {
        expect(isMissingManyDates(new Set([1, 2, 3, 4]))).toBe(true)
    })

    it("is true above the threshold", () => {
        expect(isMissingManyDates(new Set([1, 2, 3, 4, 5]))).toBe(true)
    })

    it("is false just below the threshold", () => {
        expect(isMissingManyDates(new Set([1, 2, 3]))).toBe(false)
    })

    it("is false when nothing is marked unavailable", () => {
        expect(isMissingManyDates(new Set())).toBe(false)
    })
})

describe("isMissingAllPlayoffs", () => {
    it("is true when every playoff date is marked unavailable", () => {
        expect(isMissingAllPlayoffs(events(7, 8), new Set([7, 8]))).toBe(true)
    })

    it("is false when one playoff date is still available", () => {
        expect(isMissingAllPlayoffs(events(7, 8), new Set([7]))).toBe(false)
    })

    it("is false when the season has no playoff dates", () => {
        expect(isMissingAllPlayoffs([], new Set([7, 8]))).toBe(false)
    })
})
