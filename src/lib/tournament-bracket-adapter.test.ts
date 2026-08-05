import { describe, expect, it } from "vitest"

import {
    buildTournamentBracket,
    type TournamentBracketRow
} from "@/lib/tournament-bracket-adapter"

const TEAMS = new Map([
    [1, "Team A"],
    [2, "Team B"],
    [3, "Team C"],
    [4, "Team D"],
    [5, "Team E"],
    [6, "Team F"]
])

let nextId = 1
function row(
    bracket: string,
    round: number,
    slot: number,
    over: Partial<TournamentBracketRow> = {}
): TournamentBracketRow {
    return {
        id: nextId++,
        bracket,
        bracketRound: round,
        bracketSlot: slot,
        court: null,
        startTime: null,
        homeTeamId: null,
        awayTeamId: null,
        homeSet1: null,
        awaySet1: null,
        homeSet2: null,
        awaySet2: null,
        homeSet3: null,
        awaySet3: null,
        winnerTeamId: null,
        ...over
    }
}

describe("buildTournamentBracket", () => {
    it("returns null for pool-only rows", () => {
        expect(
            buildTournamentBracket([row("pool", 1, 1)], TEAMS, null)
        ).toBeNull()
    })

    it("links a 4-team single elimination (semis -> final)", () => {
        const result = buildTournamentBracket(
            [
                row("winners", 1, 1, {
                    homeTeamId: 1,
                    awayTeamId: 4,
                    homeSet1: 25,
                    awaySet1: 20,
                    homeSet2: 25,
                    awaySet2: 18,
                    winnerTeamId: 1
                }),
                row("winners", 1, 2, {
                    homeTeamId: 3,
                    awayTeamId: 2,
                    winnerTeamId: 2
                }),
                row("final", 2, 1, {
                    homeTeamId: 1,
                    awayTeamId: 2,
                    winnerTeamId: 1
                })
            ],
            TEAMS,
            "2026-07-18"
        )
        expect(result).not.toBeNull()
        const { upper, lower } = result as NonNullable<typeof result>
        expect(lower).toHaveLength(0)
        expect(upper).toHaveLength(3)
        const [semi1, semi2, final] = upper
        expect(semi1.nextMatchId).toBe(final.id)
        expect(semi2.nextMatchId).toBe(final.id)
        expect(final.nextMatchId).toBeNull()
        expect(semi1.scoresDisplay).toBe("25-20  25-18")
        expect(semi1.participants[0]).toMatchObject({
            name: "Team A",
            isWinner: true,
            resultText: "2"
        })
        expect(final.participants[0].isWinner).toBe(true)
    })

    it("links a double elimination with grand final and loser drops", () => {
        const result = buildTournamentBracket(
            [
                row("winners", 1, 1, { homeTeamId: 1, awayTeamId: 4 }),
                row("winners", 1, 2, { homeTeamId: 3, awayTeamId: 2 }),
                row("winners", 2, 1),
                row("losers", 1, 1),
                row("final", 1, 1)
            ],
            TEAMS,
            null
        )
        const { upper, lower } = result as NonNullable<typeof result>
        // upper: W1s1(#1), W1s2(#2), W2s1(#3), grand final(#5); lower: L1s1(#4)
        expect(upper.map((m) => m.id)).toEqual([1, 2, 3, 5])
        expect(lower.map((m) => m.id)).toEqual([4])
        const [w1, w2, wf, gf] = upper
        expect(w1.nextMatchId).toBe(3)
        expect(w2.nextMatchId).toBe(3)
        expect(w1.nextLooserMatchId).toBe(4)
        expect(w2.nextLooserMatchId).toBe(4)
        expect(wf.nextMatchId).toBe(5)
        expect(lower[0].nextMatchId).toBe(5)
        expect(gf.tournamentRoundText).toBe("GF")
        expect(wf.participants[0].name).toBe("Winner Match #1")
    })

    it("renders a materialized round-one bye as a walk-over", () => {
        const result = buildTournamentBracket(
            [
                row("winners", 1, 1, {
                    homeTeamId: 1,
                    awayTeamId: null,
                    winnerTeamId: 1
                }),
                row("winners", 1, 2, {
                    homeTeamId: 3,
                    awayTeamId: 2,
                    winnerTeamId: 2
                }),
                row("final", 2, 1)
            ],
            TEAMS,
            null
        )
        const { upper } = result as NonNullable<typeof result>
        const bye = upper[0]
        expect(bye.state).toBe("WALK_OVER")
        expect(bye.participants[0]).toMatchObject({
            name: "Team A",
            isWinner: true,
            status: "WALK_OVER"
        })
        expect(bye.participants[1]).toMatchObject({
            name: "BYE",
            status: "NO_SHOW"
        })
        expect(bye.scoresDisplay).toBe("—")
    })

    it("nulls refs that point outside the rendered set", () => {
        const result = buildTournamentBracket(
            [
                // Winners final with no grand final row and losers present:
                // champion's next would dangle without the guard.
                row("winners", 1, 1, { homeTeamId: 1, awayTeamId: 2 }),
                row("losers", 5, 1)
            ],
            TEAMS,
            null
        )
        const { upper, lower } = result as NonNullable<typeof result>
        expect(upper[0].nextMatchId).toBeNull()
        expect(lower[0].nextMatchId).toBeNull()
    })
})
