import { describe, expect, it } from "vitest"
import {
    FOUR_TEAM_PLAYOFF,
    FOUR_TEAM_WEEKS,
    getPairedCourt,
    getPlayoffMatchTime,
    SIX_TEAM_PLAYOFF,
    SIX_TEAM_ROTATIONS,
    SIX_TEAM_ROUNDS
} from "./schedule-constants"

function pairKey(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`
}

describe("SIX_TEAM_ROUNDS", () => {
    it("covers all 15 pairings exactly once across the five rounds", () => {
        const seen = new Map<string, number>()
        for (const round of SIX_TEAM_ROUNDS) {
            for (const [home, away] of round) {
                const key = pairKey(home, away)
                seen.set(key, (seen.get(key) ?? 0) + 1)
            }
        }
        expect(seen.size).toBe(15)
        for (const count of seen.values()) {
            expect(count).toBe(1)
        }
    })

    it("uses each of the six teams exactly once per round", () => {
        for (const round of SIX_TEAM_ROUNDS) {
            const teams = round.flat().sort((a, b) => a - b)
            expect(teams).toEqual([1, 2, 3, 4, 5, 6])
        }
    })
})

describe("SIX_TEAM_ROTATIONS", () => {
    it("plays every round once in weeks 1-5 and repeats round A in week 6", () => {
        for (const rotation of SIX_TEAM_ROTATIONS) {
            expect(rotation).toHaveLength(6)
            expect([...rotation.slice(0, 5)].sort()).toEqual([0, 1, 2, 3, 4])
            expect(rotation[5]).toBe(0)
        }
    })
})

describe("FOUR_TEAM_WEEKS", () => {
    it("plays each pairing exactly twice across the six weeks", () => {
        const seen = new Map<string, number>()
        for (const week of FOUR_TEAM_WEEKS) {
            for (const [home, away] of week) {
                const key = pairKey(home, away)
                seen.set(key, (seen.get(key) ?? 0) + 1)
            }
        }
        expect(seen.size).toBe(6)
        for (const count of seen.values()) {
            expect(count).toBe(2)
        }
    })

    it("uses each of the four teams exactly once per week", () => {
        for (const week of FOUR_TEAM_WEEKS) {
            const teams = week.flat().sort((a, b) => a - b)
            expect(teams).toEqual([1, 2, 3, 4])
        }
    })
})

describe("getPairedCourt", () => {
    it("pairs courts mutually", () => {
        for (const court of [1, 2, 3, 4, 5, 6]) {
            expect(getPairedCourt(getPairedCourt(court))).toBe(court)
        }
        expect(getPairedCourt(1)).toBe(2)
        expect(getPairedCourt(6)).toBe(5)
    })
})

describe("getPlayoffMatchTime", () => {
    const week2Match = SIX_TEAM_PLAYOFF.find(
        (m) => m.week === 2 && m.week2SlotIndex === 0
    )
    const week1Match = SIX_TEAM_PLAYOFF.find((m) => m.week === 1)

    it("returns the fixed time outside week 2", () => {
        expect(week1Match).toBeDefined()
        if (!week1Match) return
        expect(getPlayoffMatchTime(week1Match, 1, false)).toBe(week1Match.time)
    })

    it("gives early slots to fall courts 1/3/6 and spring courts 2/4/5", () => {
        expect(week2Match).toBeDefined()
        if (!week2Match) return
        expect(getPlayoffMatchTime(week2Match, 1, false)).toBe("19:00")
        expect(getPlayoffMatchTime(week2Match, 2, false)).toBe("20:40")
        expect(getPlayoffMatchTime(week2Match, 2, true)).toBe("19:00")
        expect(getPlayoffMatchTime(week2Match, 1, true)).toBe("20:40")
    })
})

describe.each([
    ["SIX_TEAM_PLAYOFF", SIX_TEAM_PLAYOFF, 11],
    ["FOUR_TEAM_PLAYOFF", FOUR_TEAM_PLAYOFF, 7]
])("%s bracket integrity", (_name, bracket, matchCount) => {
    it("numbers matches sequentially with no duplicates", () => {
        const nums = bracket.map((m) => m.matchNum).sort((a, b) => a - b)
        expect(nums).toEqual(
            Array.from({ length: matchCount }, (_, i) => i + 1)
        )
    })

    it("only advances to matches that exist", () => {
        const valid = new Set(bracket.map((m) => m.matchNum))
        for (const match of bracket) {
            if (match.nextMatchNum !== null) {
                expect(valid.has(match.nextMatchNum)).toBe(true)
                expect(match.nextMatchNum).toBeGreaterThan(match.matchNum)
            }
            if (match.nextLoserMatchNum !== null) {
                expect(valid.has(match.nextLoserMatchNum)).toBe(true)
            }
        }
    })

    it("ends with a championship match that has no successor", () => {
        const final = bracket[bracket.length - 1]
        expect(final.bracket).toBe("championship")
        expect(final.nextMatchNum).toBeNull()
    })

    it("references only valid seed/winner/loser tokens", () => {
        for (const match of bracket) {
            for (const token of [match.homeSeed, match.awaySeed]) {
                expect(token).toMatch(/^[SWL]\d+$/)
            }
        }
    })
})
