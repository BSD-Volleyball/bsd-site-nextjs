import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToString } from "react-dom/server"

import {
    DoubleEliminationBracket,
    SingleEliminationBracket
} from "@/components/playoff-brackets"
import type { Match } from "@/components/playoff-brackets"
import {
    buildTournamentBracket,
    type TournamentBracketRow
} from "@/lib/tournament-bracket-adapter"

function match(id: number, nextMatchId: number | null): Match {
    return {
        id,
        name: `Match #${id}`,
        nextMatchId,
        nextLooserMatchId: null,
        tournamentRoundText: "",
        startTime: "",
        state: "NO_PARTY",
        participants: [
            {
                id: `h${id}`,
                name: `Home ${id}`,
                resultText: null,
                isWinner: false,
                status: null
            },
            {
                id: `a${id}`,
                name: `Away ${id}`,
                resultText: null,
                isWinner: false,
                status: null
            }
        ]
    }
}

// 4-team single elim: two semis feeding a final. No losers bracket.
const SINGLE_ELIM = [match(1, 3), match(2, 3), match(3, null)]

const stubMatchComponent = () => null

describe("SingleEliminationBracket", () => {
    it("renders single-elimination matches without a losers bracket", () => {
        const html = renderToString(
            createElement(SingleEliminationBracket, {
                matches: SINGLE_ELIM,
                matchComponent: stubMatchComponent
            })
        )
        expect(html).toContain("<svg")
    })

    it("renders the tournament adapter's output for an 8-team single elim", () => {
        // The shape that crashed in production: winners rounds + a 'final'
        // bracket row, no losers matches, no scores entered yet.
        let id = 1
        const row = (
            bracket: string,
            round: number,
            slot: number
        ): TournamentBracketRow => ({
            id: id++,
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
            winnerTeamId: null
        })
        const rows = [
            row("winners", 1, 1),
            row("winners", 1, 2),
            row("winners", 1, 3),
            row("winners", 1, 4),
            row("winners", 2, 1),
            row("winners", 2, 2),
            row("final", 3, 1)
        ]
        const bracket = buildTournamentBracket(rows, new Map(), null)
        expect(bracket).not.toBeNull()
        expect(bracket?.lower).toHaveLength(0)
        const html = renderToString(
            createElement(SingleEliminationBracket, {
                matches: (bracket as NonNullable<typeof bracket>).upper,
                matchComponent: stubMatchComponent
            })
        )
        expect(html).toContain("<svg")
    })

    it("renders a lone final match", () => {
        const html = renderToString(
            createElement(SingleEliminationBracket, {
                matches: [match(1, null)],
                matchComponent: stubMatchComponent
            })
        )
        expect(html).toContain("<svg")
    })
})

describe("DoubleEliminationBracket", () => {
    it("still renders when both brackets have matches", () => {
        // Grand final (#5) lives in upper with no next, as production data
        // shapes it; the losers champion (#4) converges into it.
        const upper = [match(1, 3), match(2, 3), match(3, 5), match(5, null)]
        const lower = [match(4, 5)]
        const html = renderToString(
            createElement(DoubleEliminationBracket, {
                matches: { upper, lower },
                matchComponent: stubMatchComponent
            })
        )
        expect(html).toContain("<svg")
    })

    it("throws on an empty losers bracket (why BracketView must switch)", () => {
        expect(() =>
            renderToString(
                createElement(DoubleEliminationBracket, {
                    matches: { upper: SINGLE_ELIM, lower: [] },
                    matchComponent: stubMatchComponent
                })
            )
        ).toThrow()
    })
})
