import { describe, expect, it } from "vitest"
import { parseSourceToken } from "@/lib/playoff-sources"
import { FOUR_TEAM_PLAYOFF, SIX_TEAM_PLAYOFF } from "@/lib/schedule-constants"
import {
    assignRounds,
    type CombinedMatch,
    classifySections,
    compareByMatchNum,
    compareChronological,
    indexByMatchNum,
    sourceRefIsWin,
    sourceRefMatch
} from "./structure"
import { combined } from "./testing"

/** The generator's template as meta-only rows, with or without brackets. */
function fromTemplate(
    template: typeof SIX_TEAM_PLAYOFF,
    keepBracket: boolean
): CombinedMatch[] {
    return template.map((t) =>
        combined({
            matchNum: t.matchNum,
            week: t.week,
            home: t.homeSeed,
            away: t.awaySeed,
            work: t.workTeam,
            metaBracket: keepBracket ? t.bracket : null
        })
    )
}

function shape(matches: CombinedMatch[]) {
    return Object.fromEntries(
        matches.map((m) => [m.matchNum, `${m.section}:${m.round}`])
    )
}

describe("classifySections + assignRounds", () => {
    it("lays out the six-team double elimination with stored brackets", () => {
        const matches = fromTemplate(SIX_TEAM_PLAYOFF, true)
        classifySections(matches)
        assignRounds(matches)
        expect(shape(matches)).toEqual({
            1: "winners:1",
            2: "winners:2",
            3: "winners:1",
            4: "winners:2",
            5: "losers:1",
            6: "losers:1",
            7: "winners:3",
            8: "losers:2",
            9: "losers:3",
            10: "championship:1",
            11: "championship:2"
        })
    })

    it("infers the same layout when no bracket is stored", () => {
        const stored = fromTemplate(SIX_TEAM_PLAYOFF, true)
        const inferred = fromTemplate(SIX_TEAM_PLAYOFF, false)
        for (const ms of [stored, inferred]) {
            classifySections(ms)
            assignRounds(ms)
        }
        expect(shape(inferred)).toEqual(shape(stored))
    })

    it("lays out the four-team bracket", () => {
        const matches = fromTemplate(FOUR_TEAM_PLAYOFF, false)
        classifySections(matches)
        assignRounds(matches)
        expect(shape(matches)).toEqual({
            1: "winners:1",
            2: "winners:1",
            3: "winners:2",
            4: "losers:1",
            5: "losers:2",
            6: "championship:1",
            7: "championship:2"
        })
    })

    it("a W/L pair of the same match is the championship even if stored as winners", () => {
        const matches = [
            combined({ matchNum: 1, home: "S1", away: "S2" }),
            combined({
                matchNum: 2,
                home: "W1",
                away: "L1",
                metaBracket: "winners"
            })
        ]
        classifySections(matches)
        expect(matches[1].section).toBe("championship")
    })

    it("reads the stored bracket case-insensitively", () => {
        const matches = [
            combined({
                matchNum: 1,
                home: "TBD",
                away: "TBD",
                metaBracket: "LOSERS"
            })
        ]
        classifySections(matches)
        expect(matches[0].section).toBe("losers")
    })

    it("lets reference evidence override a stored bracket that contradicts it", () => {
        const matches = [
            combined({
                matchNum: 1,
                home: "S1",
                away: "S2",
                metaBracket: "losers"
            })
        ]
        classifySections(matches)
        expect(matches[0].section).toBe("winners")
    })

    it("a stored 'championship' bracket is not trusted directly; the refs decide", () => {
        const matches = [
            combined({ matchNum: 1, home: "S1", away: "S2" }),
            combined({
                matchNum: 2,
                home: "W1",
                away: "S3",
                metaBracket: "championship"
            })
        ]
        classifySections(matches)
        expect(matches[1].section).toBe("winners")
    })

    it("falls back to winners for a match with no sources", () => {
        const matches = [combined({ key: "match-9", matchNum: null })]
        classifySections(matches)
        assignRounds(matches)
        expect(matches[0].section).toBe("winners")
        expect(matches[0].round).toBe(1)
    })

    it("ignores references into another section when counting rounds", () => {
        const matches = [
            combined({ matchNum: 1, home: "S1", away: "S2" }),
            combined({ matchNum: 2, home: "S3", away: "S4" }),
            combined({ matchNum: 3, home: "L1", away: "L2" })
        ]
        classifySections(matches)
        assignRounds(matches)
        expect(shape(matches)).toEqual({
            1: "winners:1",
            2: "winners:1",
            3: "losers:1"
        })
    })

    it("terminates on a reference cycle", () => {
        const matches = [
            combined({ matchNum: 1, home: "W2", away: "S1" }),
            combined({ matchNum: 2, home: "W1", away: "S2" })
        ]
        classifySections(matches)
        assignRounds(matches)
        expect(shape(matches)).toEqual({ 1: "winners:3", 2: "winners:2" })
    })
})

describe("ordering helpers", () => {
    const at = (
        week: number,
        time: string | null,
        court: number | null,
        matchNum: number | null
    ) => ({ week, time, court, matchNum })

    it("compareChronological: week, time, court, match number, nulls last", () => {
        const items = [
            at(2, "19:00", 1, 1),
            at(1, null, 1, 2),
            at(1, "19:50", 1, 3),
            at(1, "19:00", null, 4),
            at(1, "19:00", 2, null),
            at(1, "19:00", 2, 5),
            at(1, "19:00", 1, 6)
        ]
        expect(
            [...items].sort(compareChronological).map((i) => i.matchNum)
        ).toEqual([6, 5, null, 4, 3, 2, 1])
    })

    it("compareByMatchNum puts numbered matches first", () => {
        const items = [
            at(1, "19:00", 1, null),
            at(3, null, null, 2),
            at(1, "20:00", 1, 1)
        ]
        expect(
            [...items].sort(compareByMatchNum).map((i) => i.matchNum)
        ).toEqual([1, 2, null])
    })

    it("indexByMatchNum keeps the first row per number", () => {
        const first = combined({ key: "a", matchNum: 1 })
        const dup = combined({ key: "b", matchNum: 1 })
        const index = indexByMatchNum([
            first,
            dup,
            combined({ matchNum: null })
        ])
        expect([...index.keys()]).toEqual([1])
        expect(index.get(1)).toBe(first)
    })
})

describe("source reference helpers", () => {
    it("expose the referenced match and whether it is the winner", () => {
        expect(sourceRefMatch(parseSourceToken("W3"))).toBe(3)
        expect(sourceRefIsWin(parseSourceToken("W3"))).toBe(true)
        expect(sourceRefMatch(parseSourceToken("L7"))).toBe(7)
        expect(sourceRefIsWin(parseSourceToken("L7"))).toBe(false)
        expect(sourceRefMatch(parseSourceToken("S1"))).toBeNull()
        expect(sourceRefIsWin(parseSourceToken("S1"))).toBeNull()
        expect(sourceRefMatch(parseSourceToken(null))).toBeNull()
    })
})
