import { describe, expect, it } from "vitest"
import {
    allocateByWeightWithCapacity,
    getDivisionTargets,
    getScoreBandLevel,
    getSnakeOrder
} from "./allocation"
import type { PreseasonDivision } from "./types"

describe("getScoreBandLevel", () => {
    it("maps a score to its division-level band", () => {
        expect(getScoreBandLevel(0, 50)).toBe(1)
        expect(getScoreBandLevel(49, 50)).toBe(1)
        expect(getScoreBandLevel(50, 50)).toBe(2)
        expect(getScoreBandLevel(125, 50)).toBe(3)
    })
})

describe("allocateByWeightWithCapacity", () => {
    it("splits evenly for equal weights", () => {
        expect(allocateByWeightWithCapacity(10, [10, 10], [1, 1])).toEqual([
            5, 5
        ])
    })

    it("respects capacity limits and reroutes the overflow", () => {
        expect(allocateByWeightWithCapacity(10, [3, 10], [1, 1])).toEqual([
            3, 7
        ])
    })

    it("routes overflow from a capped slot to the least-loaded slot", () => {
        const result = allocateByWeightWithCapacity(12, [2, 6, 10], [1, 1, 1])
        expect(result).toEqual([2, 4, 6])
        expect(result.reduce((a, b) => a + b, 0)).toBe(12)
        result.forEach((n, i) => {
            expect(n).toBeLessThanOrEqual([2, 6, 10][i])
        })
    })

    it("allocates everything even with uneven rounding", () => {
        const result = allocateByWeightWithCapacity(7, [10, 10, 10], [1, 1, 1])
        expect(result.reduce((a, b) => a + b, 0)).toBe(7)
        for (const n of result) {
            expect(n).toBeGreaterThanOrEqual(2)
        }
    })

    it("returns zeros for zero totals or zero weights", () => {
        expect(allocateByWeightWithCapacity(0, [5, 5], [1, 1])).toEqual([0, 0])
        expect(allocateByWeightWithCapacity(5, [5, 5], [0, 0])).toEqual([0, 0])
    })

    it("weights the allocation proportionally", () => {
        expect(allocateByWeightWithCapacity(9, [10, 10], [2, 1])).toEqual([
            6, 3
        ])
    })
})

describe("getSnakeOrder", () => {
    it("snakes forward then backward across teams", () => {
        expect(getSnakeOrder(8, 4)).toEqual([0, 1, 2, 3, 3, 2, 1, 0])
    })

    it("continues the pattern for longer drafts", () => {
        expect(getSnakeOrder(10, 4)).toEqual([0, 1, 2, 3, 3, 2, 1, 0, 0, 1])
    })

    it("stops at the requested length", () => {
        expect(getSnakeOrder(2, 4)).toEqual([0, 1])
        expect(getSnakeOrder(0, 4)).toEqual([])
    })

    it("gives every team an equal share over full rounds", () => {
        const order = getSnakeOrder(24, 6)
        const counts = new Map<number, number>()
        for (const team of order) {
            counts.set(team, (counts.get(team) ?? 0) + 1)
        }
        for (const team of [0, 1, 2, 3, 4, 5]) {
            expect(counts.get(team)).toBe(4)
        }
    })
})

function division(
    overrides: Partial<PreseasonDivision> = {}
): PreseasonDivision {
    return {
        id: 1,
        name: "AA",
        level: 1,
        index: 0,
        teamCount: 2,
        isLast: false,
        usesCoaches: false,
        malePerTeam: 5,
        nonMalePerTeam: 3,
        ...overrides
    }
}

/** 24 players, alternating male/non-male */
function buildBalancedPool() {
    return Array.from({ length: 24 }, (_, i) => ({ male: i % 2 === 0 }))
}

describe("getDivisionTargets", () => {
    it("sizes divisions by team count and mirrors the gender ratio", () => {
        const testDivisions = [
            division({ id: 1, teamCount: 2 }),
            division({
                id: 2,
                name: "A",
                level: 2,
                index: 1,
                teamCount: 2,
                isLast: true
            })
        ]
        const targets = getDivisionTargets(testDivisions, buildBalancedPool())

        for (const id of [1, 2]) {
            const target = targets.get(id)
            expect(target?.size).toBe(12)
            expect(target?.male).toBe(6)
            expect(target?.nonMale).toBe(6)
        }
    })

    it("returns an empty map when there are no teams", () => {
        expect(getDivisionTargets([], buildBalancedPool()).size).toBe(0)
    })

    it("gives each division the non-male share its configured split asks for", () => {
        // 48 players, 24 non-male. Three 2-team divisions with different
        // splits: demand is 6-2 -> 4, 5-3 -> 6, 4-4 -> 8, totalling 18 of the
        // 24 available, so every division should clear its full demand.
        const testDivisions = [
            division({ id: 1, malePerTeam: 6, nonMalePerTeam: 2 }),
            division({
                id: 2,
                name: "A",
                level: 2,
                index: 1,
                malePerTeam: 5,
                nonMalePerTeam: 3
            }),
            division({
                id: 3,
                name: "BB",
                level: 3,
                index: 2,
                isLast: true,
                malePerTeam: 4,
                nonMalePerTeam: 4
            })
        ]
        const pool = Array.from({ length: 48 }, (_entry, i) => ({
            male: i % 2 === 0
        }))

        const targets = getDivisionTargets(testDivisions, pool)

        // The whole point: a 4-4 division must not be handed the same ratio
        // as a 6-2 one just because they sit in the same pool.
        expect(targets.get(1)?.nonMale).toBeLessThan(
            targets.get(2)?.nonMale as number
        )
        expect(targets.get(2)?.nonMale).toBeLessThan(
            targets.get(3)?.nonMale as number
        )

        // Every seat still gets allocated to exactly one gender.
        for (const id of [1, 2, 3]) {
            const target = targets.get(id)
            expect((target?.male as number) + (target?.nonMale as number)).toBe(
                target?.size
            )
        }

        const allocatedNonMale = [1, 2, 3].reduce(
            (sum, id) => sum + (targets.get(id)?.nonMale ?? 0),
            0
        )
        expect(allocatedNonMale).toBe(24)
    })

    it("spreads a non-male shortfall proportionally to configured demand", () => {
        // Same three divisions, but only 9 non-male players for 18 demanded:
        // each division should land near half its demand rather than all
        // divisions being flattened to one league-wide ratio.
        const testDivisions = [
            division({ id: 1, malePerTeam: 6, nonMalePerTeam: 2 }),
            division({
                id: 2,
                name: "A",
                level: 2,
                index: 1,
                malePerTeam: 5,
                nonMalePerTeam: 3
            }),
            division({
                id: 3,
                name: "BB",
                level: 3,
                index: 2,
                isLast: true,
                malePerTeam: 4,
                nonMalePerTeam: 4
            })
        ]
        const pool = Array.from({ length: 48 }, (_entry, i) => ({
            male: i >= 9
        }))

        const targets = getDivisionTargets(testDivisions, pool)

        expect(targets.get(1)?.nonMale).toBe(2)
        expect(targets.get(2)?.nonMale).toBe(3)
        expect(targets.get(3)?.nonMale).toBe(4)
    })
})
