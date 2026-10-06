import { describe, expect, it } from "vitest"
import {
    formatSetScoreDisplay,
    getGameWins,
    getLoserTeamId,
    getSetScores,
    getWinnerTeamId
} from "./match-results"
import { combined } from "./testing"

describe("getSetScores", () => {
    it("keeps only sets where both sides have a score", () => {
        const m = combined({
            homeSet1Score: 25,
            awaySet1Score: 20,
            homeSet2Score: 22,
            awaySet2Score: null,
            homeSet3Score: 15,
            awaySet3Score: 13
        })
        expect(getSetScores(m)).toEqual([
            { home: 25, away: 20 },
            { home: 15, away: 13 }
        ])
    })
})

describe("getGameWins", () => {
    it("prefers stored home/away game counts over set scores", () => {
        const m = combined({
            homeScore: 1,
            awayScore: 2,
            homeSet1Score: 25,
            awaySet1Score: 10
        })
        expect(getGameWins(m)).toEqual({ homeWins: 1, awayWins: 2 })
    })

    it("counts set wins when game counts are missing; a tied set counts for neither", () => {
        const m = combined({
            homeScore: 2,
            awayScore: null,
            homeSet1Score: 25,
            awaySet1Score: 20,
            homeSet2Score: 18,
            awaySet2Score: 25,
            homeSet3Score: 15,
            awaySet3Score: 15
        })
        expect(getGameWins(m)).toEqual({ homeWins: 1, awayWins: 1 })
    })

    it("is null on both sides with no scores at all", () => {
        expect(getGameWins(combined())).toEqual({
            homeWins: null,
            awayWins: null
        })
    })
})

describe("getWinnerTeamId", () => {
    it("trusts the winner column even when scores disagree", () => {
        const m = combined({
            homeTeamId: 1,
            awayTeamId: 2,
            homeScore: 2,
            awayScore: 0,
            winnerTeamId: 2
        })
        expect(getWinnerTeamId(m)).toBe(2)
    })

    it("trusts the winner column when a side is not backfilled", () => {
        expect(
            getWinnerTeamId(combined({ homeTeamId: 1, winnerTeamId: 1 }))
        ).toBe(1)
    })

    it("derives the winner from game counts, then set scores", () => {
        expect(
            getWinnerTeamId(
                combined({
                    homeTeamId: 1,
                    awayTeamId: 2,
                    homeScore: 0,
                    awayScore: 2
                })
            )
        ).toBe(2)
        expect(
            getWinnerTeamId(
                combined({
                    homeTeamId: 1,
                    awayTeamId: 2,
                    homeSet1Score: 25,
                    awaySet1Score: 21
                })
            )
        ).toBe(1)
    })

    it("is null when a side is unknown, nothing is scored, or games are level", () => {
        expect(
            getWinnerTeamId(
                combined({ homeTeamId: 1, homeScore: 2, awayScore: 0 })
            )
        ).toBeNull()
        expect(
            getWinnerTeamId(combined({ homeTeamId: 1, awayTeamId: 2 }))
        ).toBeNull()
        expect(
            getWinnerTeamId(
                combined({
                    homeTeamId: 1,
                    awayTeamId: 2,
                    homeScore: 1,
                    awayScore: 1
                })
            )
        ).toBeNull()
    })
})

describe("getLoserTeamId", () => {
    const m = combined({ homeTeamId: 1, awayTeamId: 2 })

    it("is the other side of the winner", () => {
        expect(getLoserTeamId(m, 1)).toBe(2)
        expect(getLoserTeamId(m, 2)).toBe(1)
    })

    it("is null without a winner or with a side missing", () => {
        expect(getLoserTeamId(m, null)).toBeNull()
        expect(getLoserTeamId(combined({ homeTeamId: 1 }), 1)).toBeNull()
    })

    it("treats any winner that is not home as the away side winning", () => {
        expect(getLoserTeamId(m, 99)).toBe(1)
    })
})

describe("formatSetScoreDisplay", () => {
    const m = combined({
        homeSet1Score: 20,
        awaySet1Score: 25,
        homeSet2Score: 25,
        awaySet2Score: 23,
        homeSet3Score: 10,
        awaySet3Score: 15
    })

    it("writes each set from the winner's side, two spaces apart", () => {
        expect(formatSetScoreDisplay(m, false)).toBe("25-20  23-25  15-10")
        expect(formatSetScoreDisplay(m, true)).toBe("20-25  25-23  10-15")
    })

    it("writes home-first when the winner is unknown", () => {
        expect(formatSetScoreDisplay(m, null)).toBe("20-25  25-23  10-15")
    })

    it("shows an em dash when no set is scored", () => {
        expect(formatSetScoreDisplay(combined(), true)).toBe("—")
    })
})
