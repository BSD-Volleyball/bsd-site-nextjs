import { describe, expect, it } from "vitest"
import { COACH_OBSERVATION_SLOT } from "./config"
import { resolveAvailableSlots } from "./slots"

describe("resolveAvailableSlots", () => {
    it("steers coaches to the late slot, overriding their own request", () => {
        expect(
            resolveAvailableSlots({ isCoach: true }, { availableSlots: [1] })
        ).toEqual([COACH_OBSERVATION_SLOT])
        expect(resolveAvailableSlots({ isCoach: true }, null)).toEqual([3])
    })

    it("passes a non-coach's request through", () => {
        expect(
            resolveAvailableSlots(
                { isCoach: false },
                { availableSlots: [1, 2] }
            )
        ).toEqual([1, 2])
    })

    it("is unrestricted when there is neither", () => {
        expect(resolveAvailableSlots({ isCoach: false }, undefined)).toBeNull()
    })
})
