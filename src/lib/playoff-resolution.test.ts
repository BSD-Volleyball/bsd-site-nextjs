import { describe, expect, it } from "vitest"
import {
    type ParsedSource,
    parseSourceToken,
    type PlayoffNode,
    resolveOpponentLabel,
    type ResolutionContext,
    sourceContainsTeam
} from "@/lib/playoff-resolution"

describe("parseSourceToken", () => {
    it("parses missing and blank sources as none", () => {
        expect(parseSourceToken(null).kind).toBe("none")
        expect(parseSourceToken("").kind).toBe("none")
        expect(parseSourceToken("  ").kind).toBe("none")
    })

    it.each([
        ["S4", 4],
        ["SEED12", 12],
        ["s4", 4],
        ['"S3"', 3]
    ])("parses %s as a seed token", (token, value) => {
        const parsed = parseSourceToken(token)
        expect(parsed.kind).toBe("seed")
        expect(parsed.value).toBe(value)
    })

    it.each([
        ["W1", "winner", 1],
        ["WINNER7", "winner", 7],
        ["L2", "loser", 2],
        ["LOSER10", "loser", 10]
    ])("parses %s as %s of match %i", (token, kind, value) => {
        const parsed = parseSourceToken(token)
        expect(parsed.kind).toBe(kind)
        expect(parsed.value).toBe(value)
    })

    it("parses bare numbers as direct team references", () => {
        const parsed = parseSourceToken("12")
        expect(parsed.kind).toBe("team")
        expect(parsed.value).toBe(12)
    })

    it("flags unrecognized tokens as unknown", () => {
        expect(parseSourceToken("CHAMPION").kind).toBe("unknown")
    })
})

// --- sourceContainsTeam / resolveOpponentLabel fixtures ---------------------

function node(
    overrides: Partial<PlayoffNode> & { matchNum: number }
): PlayoffNode {
    return {
        week: 1,
        homeSource: parseSourceToken(null),
        awaySource: parseSourceToken(null),
        workSource: parseSourceToken(null),
        homeTeamId: null,
        awayTeamId: null,
        workTeamId: null,
        winnerTeamId: null,
        loserTeamId: null,
        ...overrides
    }
}

function context(nodes: PlayoffNode[]): ResolutionContext {
    return {
        // Seeds 1..4 map to team ids 101..104; team numbers mirror seeds
        seedTeamIdByNumber: new Map([
            [1, 101],
            [2, 102],
            [3, 103],
            [4, 104]
        ]),
        nodeByMatchNum: new Map(nodes.map((n) => [n.matchNum, n])),
        teamNumberById: new Map([
            [101, 1],
            [102, 2],
            [103, 3],
            [104, 4]
        ])
    }
}

describe("sourceContainsTeam", () => {
    it("resolves seed sources deterministically", () => {
        const ctx = context([])
        const seed2 = parseSourceToken("S2")
        expect(sourceContainsTeam(seed2, 102, ctx)).toEqual({
            contains: true,
            condition: null
        })
        expect(sourceContainsTeam(seed2, 101, ctx).contains).toBe(false)
    })

    it("resolves direct team-number sources", () => {
        const ctx = context([])
        const team3 = parseSourceToken("3")
        expect(sourceContainsTeam(team3, 103, ctx).contains).toBe(true)
        expect(sourceContainsTeam(team3, 104, ctx).contains).toBe(false)
    })

    it("uses the decided winner of an upstream match", () => {
        const ctx = context([
            node({
                matchNum: 1,
                homeSource: parseSourceToken("S1"),
                awaySource: parseSourceToken("S4"),
                winnerTeamId: 104,
                loserTeamId: 101
            })
        ])

        const winner1 = parseSourceToken("W1")
        expect(sourceContainsTeam(winner1, 104, ctx)).toEqual({
            contains: true,
            condition: null
        })
        expect(sourceContainsTeam(winner1, 101, ctx).contains).toBe(false)

        const loser1 = parseSourceToken("L1")
        expect(sourceContainsTeam(loser1, 101, ctx).contains).toBe(true)
    })

    it("describes the outcome chain for undecided upstream matches", () => {
        const ctx = context([
            node({
                matchNum: 1,
                homeSource: parseSourceToken("S1"),
                awaySource: parseSourceToken("S4")
            })
        ])

        const result = sourceContainsTeam(parseSourceToken("W1"), 101, ctx)
        expect(result.contains).toBe(true)
        expect(result.condition).toBe("If you win match 1")
    })

    it("chains conditions through multiple undecided matches", () => {
        const ctx = context([
            node({
                matchNum: 1,
                homeSource: parseSourceToken("S1"),
                awaySource: parseSourceToken("S4")
            }),
            node({
                matchNum: 2,
                week: 2,
                homeSource: parseSourceToken("W1"),
                awaySource: parseSourceToken("S2")
            })
        ])

        const result = sourceContainsTeam(parseSourceToken("W2"), 101, ctx)
        expect(result.contains).toBe(true)
        expect(result.condition).toBe("If you win match 1 and win match 2")
    })

    it("survives cyclic match references without recursing forever", () => {
        const ctx = context([
            node({
                matchNum: 1,
                homeSource: parseSourceToken("W2"),
                awaySource: parseSourceToken("S1")
            }),
            node({
                matchNum: 2,
                homeSource: parseSourceToken("W1"),
                awaySource: parseSourceToken("S2")
            })
        ])

        // Team 103 is in neither branch; the W1<->W2 cycle must terminate
        expect(
            sourceContainsTeam(parseSourceToken("W1"), 103, ctx).contains
        ).toBe(false)
    })
})

describe("resolveOpponentLabel", () => {
    const labels = new Map<number, string>([
        [101, "Aces"],
        [104, "Diggers"]
    ])

    it("labels seeds with the team name when known", () => {
        const ctx = context([])
        expect(resolveOpponentLabel(parseSourceToken("S1"), ctx, labels)).toBe(
            "Aces"
        )
        expect(resolveOpponentLabel(parseSourceToken("S3"), ctx, labels)).toBe(
            "Seed 3"
        )
    })

    it("labels undecided references by match number", () => {
        const ctx = context([node({ matchNum: 5 })])
        expect(resolveOpponentLabel(parseSourceToken("W5"), ctx, labels)).toBe(
            "Winner of #5"
        )
        expect(resolveOpponentLabel(parseSourceToken("L5"), ctx, labels)).toBe(
            "Loser of #5"
        )
    })

    it("labels decided references with the team name", () => {
        const ctx = context([
            node({ matchNum: 5, winnerTeamId: 104, loserTeamId: 101 })
        ])
        expect(resolveOpponentLabel(parseSourceToken("W5"), ctx, labels)).toBe(
            "Diggers"
        )
    })

    it("falls back to TBD for empty sources", () => {
        const ctx = context([])
        const empty: ParsedSource = parseSourceToken(null)
        expect(resolveOpponentLabel(empty, ctx, labels)).toBe("TBD")
    })
})
