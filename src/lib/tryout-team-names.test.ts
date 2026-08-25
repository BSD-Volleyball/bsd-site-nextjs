import { describe, expect, it } from "vitest"
import {
    TRYOUT_TEAM_NAMES,
    formatTryoutMatchLabel,
    formatTryoutTeamLabel,
    getTryoutTeamName,
    tryoutTeamCode
} from "./tryout-team-names"

const SINGLE_WORD_DIVISIONS = ["AA", "A", "ABA", "ABB"] as const
const TWO_WORD_DIVISIONS = ["BBB", "BB"] as const

describe("TRYOUT_TEAM_NAMES", () => {
    it("covers the configured team counts (6/6/6/6/6/4)", () => {
        expect(TRYOUT_TEAM_NAMES.AA).toHaveLength(6)
        expect(TRYOUT_TEAM_NAMES.A).toHaveLength(6)
        expect(TRYOUT_TEAM_NAMES.ABA).toHaveLength(6)
        expect(TRYOUT_TEAM_NAMES.ABB).toHaveLength(6)
        expect(TRYOUT_TEAM_NAMES.BBB).toHaveLength(6)
        expect(TRYOUT_TEAM_NAMES.BB).toHaveLength(4)
    })

    it("single-word names run A→X with unique first letters across AA/A/ABA/ABB", () => {
        const names = SINGLE_WORD_DIVISIONS.flatMap((d) => TRYOUT_TEAM_NAMES[d])
        expect(names.every((n) => !n.includes(" "))).toBe(true)
        const letters = names.map((n) => n[0])
        const expected = Array.from({ length: 24 }, (_, i) =>
            String.fromCharCode(65 + i)
        )
        expect(letters).toEqual(expected)
    })

    it("two-word names are alphabetical with unique first letters within BBB and BB", () => {
        for (const d of TWO_WORD_DIVISIONS) {
            const names = TRYOUT_TEAM_NAMES[d]
            expect(names.every((n) => n.includes(" "))).toBe(true)
            const letters = names.map((n) => n[0])
            expect(new Set(letters).size).toBe(letters.length)
            expect([...names].sort()).toEqual([...names])
        }
    })
})

describe("label helpers", () => {
    it("formats drink + code", () => {
        expect(getTryoutTeamName("AA", 1)).toBe("Absinthe")
        expect(tryoutTeamCode("AA", 1)).toBe("AA-1")
        expect(formatTryoutTeamLabel("AA", 1)).toBe("Absinthe (AA-1)")
        expect(formatTryoutTeamLabel("BB", 4)).toBe("White Russian (BB-4)")
        expect(formatTryoutMatchLabel("AA", 1, 2)).toBe(
            "Absinthe vs. Bourbon (AA-1 vs. AA-2)"
        )
    })

    it("falls back to the bare code for unknown divisions or teams", () => {
        expect(getTryoutTeamName("AA", 7)).toBeNull()
        expect(getTryoutTeamName("C", 1)).toBeNull()
        expect(formatTryoutTeamLabel("AA", 7)).toBe("AA-7")
        expect(formatTryoutTeamLabel("C", 1)).toBe("C-1")
        expect(formatTryoutMatchLabel("BB", 5, 6)).toBe("BB-5 vs. BB-6")
    })
})
