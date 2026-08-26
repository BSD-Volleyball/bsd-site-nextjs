import { describe, expect, it } from "vitest"
import { COACH_OBSERVATION_SLOT } from "./config"
import {
    findSameTimeConflicts,
    formatSlotList,
    getTeamNumberSlot,
    resolveAvailableSlots,
    slotFitsRequest
} from "./slots"

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

describe("getTeamNumberSlot", () => {
    it("pairs teams into time slots", () => {
        expect([1, 2, 3, 4, 5, 6].map(getTeamNumberSlot)).toEqual([
            1, 1, 2, 2, 3, 3
        ])
    })
})

describe("findSameTimeConflicts", () => {
    it("flags a player on two teams that play at the same time", () => {
        const conflicts = findSameTimeConflicts([
            { userId: "u1", divisionName: "A", teamNumber: 1 },
            { userId: "u1", divisionName: "B", teamNumber: 2 },
            { userId: "u2", divisionName: "A", teamNumber: 1 },
            { userId: "u2", divisionName: "B", teamNumber: 3 },
            { userId: "", divisionName: "A", teamNumber: 2 }
        ])
        expect([...conflicts.keys()]).toEqual(["u1"])
        expect(conflicts.get("u1")).toEqual([
            {
                userId: "u1",
                slot: 1,
                teams: [
                    { divisionName: "A", teamNumber: 1 },
                    { divisionName: "B", teamNumber: 2 }
                ]
            }
        ])
    })

    it("ignores players playing twice at different times", () => {
        expect(
            findSameTimeConflicts([
                { userId: "u1", divisionName: "A", teamNumber: 1 },
                { userId: "u1", divisionName: "A", teamNumber: 5 }
            ]).size
        ).toBe(0)
    })
})

describe("slotFitsRequest", () => {
    it("treats a missing or empty request as unrestricted", () => {
        expect(slotFitsRequest(3, null)).toBe(true)
        expect(slotFitsRequest(3, undefined)).toBe(true)
        expect(slotFitsRequest(3, [])).toBe(true)
    })

    it("only accepts slots the player asked for", () => {
        expect(slotFitsRequest(1, [1, 2])).toBe(true)
        expect(slotFitsRequest(3, [1, 2])).toBe(false)
    })
})

describe("formatSlotList", () => {
    it("maps slot numbers to labels, falling back to Slot N", () => {
        expect(formatSlotList([1, 3], ["7:00 PM", "8:00 PM"])).toBe(
            "7:00 PM, Slot 3"
        )
    })
})

describe("resolveAvailableSlots (draft night)", () => {
    it("holds week-3 draft leavers to the first slot, over requests and coaching", () => {
        expect(
            resolveAvailableSlots(
                { isCoach: false, leavesForDraft: true },
                { availableSlots: [2, 3] }
            )
        ).toEqual([1])
        expect(
            resolveAvailableSlots({ isCoach: true, leavesForDraft: true }, null)
        ).toEqual([1])
        expect(
            resolveAvailableSlots(
                { isCoach: false, leavesForDraft: false },
                { availableSlots: [2, 3] }
            )
        ).toEqual([2, 3])
    })
})
