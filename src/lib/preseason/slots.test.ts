import { describe, expect, it } from "vitest"
import { COACH_OBSERVATION_SLOT } from "./config"
import {
    findSameTimeConflicts,
    getTeamNumberSlot,
    resolveAvailableSlots
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
