import { describe, expect, it } from "vitest"
import { parseSourceToken } from "@/lib/playoff-sources"
import {
    buildTeamLabelMaps,
    formatPlayoffTeamLabel,
    getTeamLabelById,
    type LabelContext,
    resolveReferenceLabel,
    resolveSideLabel,
    resolveWorkLabel
} from "./labels"
import { indexByMatchNum } from "./structure"
import { combined } from "./testing"

const { teamLabelById, teamLabelByNumber } = buildTeamLabelMaps([
    { id: 10, number: 1, name: "Aces" },
    { id: 20, number: 2, name: "Blocks" },
    { id: 30, number: null, name: "Cuts" }
])

const context: LabelContext = {
    teamLabelById,
    teamLabelByNumber,
    seedLabelBySeed: new Map([[1, "#2 Blocks"]]),
    matchByNum: indexByMatchNum([
        // #1 decided: Aces beat Blocks
        combined({
            matchNum: 1,
            homeTeamId: 10,
            awayTeamId: 20,
            winnerTeamId: 10
        }),
        // #2 undecided
        combined({ matchNum: 2, homeTeamId: 10, awayTeamId: 30 }),
        // #3 decided by the winner column with the away side not backfilled
        combined({ matchNum: 3, homeTeamId: 20, winnerTeamId: 20 })
    ])
}

const ref = (token: string | null) =>
    resolveReferenceLabel(parseSourceToken(token), context)

describe("team labels", () => {
    it("prefixes the team number when there is one", () => {
        expect(formatPlayoffTeamLabel({ number: 4, name: "Digs" })).toBe(
            "#4 Digs"
        )
        expect(formatPlayoffTeamLabel({ number: null, name: "Digs" })).toBe(
            "Digs"
        )
    })

    it("indexes labels by id and, for numbered teams, by number", () => {
        expect([...teamLabelById.entries()]).toEqual([
            [10, "#1 Aces"],
            [20, "#2 Blocks"],
            [30, "Cuts"]
        ])
        expect([...teamLabelByNumber.entries()]).toEqual([
            [1, "#1 Aces"],
            [2, "#2 Blocks"]
        ])
    })

    it("falls back to 'Team <id>' for a team outside the division", () => {
        expect(getTeamLabelById(99, context)).toBe("Team 99")
    })
})

describe("resolveReferenceLabel", () => {
    it("names seeds by their team, or 'Seed n'", () => {
        expect(ref("S1")).toBe("#2 Blocks")
        expect(ref("S5")).toBe("Seed 5")
    })

    it("names direct team-number sources", () => {
        expect(ref("2")).toBe("#2 Blocks")
        expect(ref("7")).toBe("Team #7")
    })

    it("follows decided winner/loser references to the team", () => {
        expect(ref("W1")).toBe("#1 Aces")
        expect(ref("L1")).toBe("#2 Blocks")
    })

    it("keeps the reference while the upstream match is undecided or missing", () => {
        expect(ref("W2")).toBe("Winner #2")
        expect(ref("L2")).toBe("Loser #2")
        expect(ref("W9")).toBe("Winner #9")
        expect(ref("L9")).toBe("Loser #9")
    })

    it("cannot name a loser when the upstream away side is not backfilled", () => {
        expect(ref("W3")).toBe("#2 Blocks")
        expect(ref("L3")).toBe("Loser #3")
    })

    it("shows unrecognised tokens normalised, and nothing for no source", () => {
        expect(ref(" bye ")).toBe("BYE")
        expect(ref(null)).toBeNull()
    })
})

describe("side and work labels", () => {
    it("prefers the stored team, then the reference, then TBD", () => {
        expect(resolveSideLabel(30, parseSourceToken("W2"), context)).toBe(
            "Cuts"
        )
        expect(resolveSideLabel(null, parseSourceToken("W1"), context)).toBe(
            "#1 Aces"
        )
        expect(resolveSideLabel(null, parseSourceToken(null), context)).toBe(
            "TBD"
        )
    })

    it("work label: stored work team, else its reference, else null", () => {
        expect(resolveWorkLabel(20, parseSourceToken("L1"), context)).toBe(
            "#2 Blocks"
        )
        expect(resolveWorkLabel(null, parseSourceToken("L2"), context)).toBe(
            "Loser #2"
        )
        expect(
            resolveWorkLabel(null, parseSourceToken(null), context)
        ).toBeNull()
    })
})
