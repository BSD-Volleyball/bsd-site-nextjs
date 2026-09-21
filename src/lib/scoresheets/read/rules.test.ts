import { describe, expect, it } from "vitest"

import {
    gameConstraint,
    isLegalPair,
    legalScorePairs,
    legalValues
} from "./rules"

describe("gameConstraint", () => {
    it("caps regular-season games at 27 from zero", () => {
        for (const game of [1, 2, 3] as const) {
            expect(gameConstraint("regular_season", game)).toEqual({
                target: 25,
                cap: 27,
                floor: 0
            })
        }
    })

    it("starts playoff games at 4 and uncaps the decider", () => {
        expect(gameConstraint("playoff", 1)).toEqual({
            target: 25,
            cap: 30,
            floor: 4
        })
        expect(gameConstraint("playoff", 3)).toMatchObject({
            cap: null,
            floor: 4
        })
    })
})

describe("legalScorePairs", () => {
    const regular = gameConstraint("regular_season", 1)

    it("accepts the ordinary ways a regular-season game ends", () => {
        expect(isLegalPair(regular, 25, 0)).toBe(true)
        expect(isLegalPair(regular, 25, 23)).toBe(true)
        expect(isLegalPair(regular, 26, 24)).toBe(true)
        // At the cap a single point is enough
        expect(isLegalPair(regular, 27, 26)).toBe(true)
        expect(isLegalPair(regular, 27, 25)).toBe(true)
    })

    it("rejects endings volleyball does not allow", () => {
        expect(isLegalPair(regular, 25, 24)).toBe(false) // must win by two
        expect(isLegalPair(regular, 28, 26)).toBe(false) // past the cap
        expect(isLegalPair(regular, 24, 22)).toBe(false) // short of the target
        expect(isLegalPair(regular, 25, 25)).toBe(false) // nobody wins a tie
    })

    it("is symmetric in which side won", () => {
        expect(isLegalPair(regular, 21, 25)).toBe(true)
        expect(isLegalPair(regular, 24, 26)).toBe(true)
    })

    it("honours the playoff floor of four", () => {
        const playoff = gameConstraint("playoff", 1)
        expect(isLegalPair(playoff, 25, 4)).toBe(true)
        expect(isLegalPair(playoff, 25, 3)).toBe(false)
        expect(isLegalPair(playoff, 25, 0)).toBe(false)
    })

    it("lets a playoff decider run past any cap", () => {
        const decider = gameConstraint("playoff", 3)
        expect(isLegalPair(decider, 30, 28)).toBe(true)
        expect(isLegalPair(decider, 33, 31)).toBe(true)
        // Still win by two
        expect(isLegalPair(decider, 33, 32)).toBe(false)
    })

    it("stops a capped playoff game at 30", () => {
        const capped = gameConstraint("playoff", 1)
        expect(isLegalPair(capped, 30, 29)).toBe(true)
        expect(isLegalPair(capped, 30, 28)).toBe(true)
        expect(isLegalPair(capped, 31, 29)).toBe(false)
    })

    it("never lists a pair twice", () => {
        for (const c of [
            gameConstraint("regular_season", 1),
            gameConstraint("playoff", 1),
            gameConstraint("playoff", 3)
        ]) {
            const keys = legalScorePairs(c).map((p) => `${p.winner}:${p.loser}`)
            expect(new Set(keys).size).toBe(keys.length)
        }
    })
})

describe("legalValues", () => {
    it("bounds what any single box can contain", () => {
        const values = legalValues(gameConstraint("regular_season", 1))
        expect(Math.min(...values)).toBe(0)
        expect(Math.max(...values)).toBe(27)
        expect(values).toContain(25)
        expect(values).not.toContain(28)
    })

    it("keeps a playoff box above the starting score", () => {
        const values = legalValues(gameConstraint("playoff", 1))
        expect(Math.min(...values)).toBe(4)
        expect(Math.max(...values)).toBe(30)
    })
})
