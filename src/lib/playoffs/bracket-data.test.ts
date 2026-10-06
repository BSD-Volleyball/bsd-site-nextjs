import { describe, expect, it } from "vitest"
import { SIX_TEAM_PLAYOFF } from "@/lib/schedule-constants"
import { buildBracketData } from "./bracket-data"
import type { LabelContext } from "./labels"
import {
    assignRounds,
    type CombinedMatch,
    classifySections,
    indexByMatchNum
} from "./structure"
import { combined } from "./testing"

function contextFor(matches: CombinedMatch[]): LabelContext {
    return {
        teamLabelById: new Map([
            [1, "#1 Aces"],
            [2, "#2 Blocks"]
        ]),
        teamLabelByNumber: new Map(),
        seedLabelBySeed: new Map([[1, "#1 Aces"]]),
        matchByNum: indexByMatchNum(matches)
    }
}

function sixTeam(): CombinedMatch[] {
    const matches = SIX_TEAM_PLAYOFF.map((t) =>
        combined({
            matchNum: t.matchNum,
            week: t.week,
            home: t.homeSeed,
            away: t.awaySeed,
            work: t.workTeam,
            metaBracket: t.bracket,
            nextMatchNum: t.nextMatchNum,
            nextLoserMatchNum: t.nextLoserMatchNum
        })
    )
    classifySections(matches)
    assignRounds(matches)
    return matches
}

describe("buildBracketData", () => {
    it("is null when no match is numbered", () => {
        const matches = [combined({ key: "match-1", matchNum: null })]
        expect(buildBracketData(matches, contextFor(matches))).toBeNull()
    })

    it("splits winners+championship (upper) from losers (lower) and adds BYEs for seeds 1 and 2", () => {
        const matches = sixTeam()
        const bracket = buildBracketData(matches, contextFor(matches))
        expect(bracket?.upper.map((m) => m.id)).toEqual([
            1, 2, 3, 4, 7, 10, 11, -1, -2
        ])
        expect(bracket?.lower.map((m) => m.id)).toEqual([5, 6, 8, 9])

        const byes = bracket?.upper.filter((m) => m.id < 0)
        expect(
            byes?.map((m) => [m.nextMatchId, m.participants[0].name])
        ).toEqual([
            [2, "#1 Aces"],
            [4, "Seed 2"]
        ])
        expect(byes?.[0]).toMatchObject({
            name: "BYE",
            state: "WALK_OVER",
            tournamentRoundText: "BYE",
            week: 0,
            scoresDisplay: "—",
            homeTeamId: null,
            awayTeamId: null
        })
        expect(byes?.[0].participants[1]).toEqual({
            id: "bye--1",
            name: "BYE",
            resultText: null,
            isWinner: false,
            status: "NO_SHOW"
        })
    })

    it("describes each numbered match for the card", () => {
        const matches = sixTeam()
        const bracket = buildBracketData(matches, contextFor(matches))
        const m7 = bracket?.upper.find((m) => m.id === 7)
        expect(m7).toMatchObject({
            name: "Match #7",
            tournamentRoundText: "R3",
            state: "NO_PARTY",
            startTime: "",
            nextMatchId: 10,
            nextLooserMatchId: 9,
            homeSourceLabel: "W2",
            awaySourceLabel: "W4",
            workTeamLabel: "Loser #5",
            homeSourceRefMatch: 2,
            homeSourceRefIsWin: true,
            workSourceRefMatch: 5,
            workSourceRefIsWin: false,
            scoresDisplay: "—"
        })
        expect(m7?.participants.map((p) => [p.id, p.name, p.status])).toEqual([
            ["home-7", "Winner #2", null],
            ["away-7", "Winner #4", null]
        ])
    })

    it("marks a decided match and passes ids through the effective resolver", () => {
        const matches = [
            combined({
                matchNum: 1,
                home: "S1",
                away: "S2",
                homeTeamId: 1,
                awayTeamId: 2,
                homeSet1Score: 20,
                awaySet1Score: 25,
                homeSet2Score: 21,
                awaySet2Score: 25,
                date: "2031-11-03"
            })
        ]
        classifySections(matches)
        const bracket = buildBracketData(
            matches,
            contextFor(matches),
            (teamId) => (teamId === null ? null : teamId * 100)
        )
        const m1 = bracket?.upper[0]
        expect(m1).toMatchObject({
            state: "SCORE_DONE",
            startTime: "2031-11-03",
            scoresDisplay: "25-20  25-21",
            homeTeamId: 100,
            awayTeamId: 200,
            workTeamId: null
        })
        expect(
            m1?.participants.map((p) => [p.resultText, p.isWinner, p.status])
        ).toEqual([
            ["0", false, "PLAYED"],
            ["2", true, "PLAYED"]
        ])
    })

    it("nulls forward refs to matches that are not in the bracket", () => {
        // The reset final (#11) was pruned: #10 must not point at it.
        const matches = sixTeam().filter((m) => m.matchNum !== 11)
        const bracket = buildBracketData(matches, contextFor(matches))
        const m10 = bracket?.upper.find((m) => m.id === 10)
        expect(m10?.nextMatchId).toBeNull()
        expect(m10?.nextLooserMatchId).toBeNull()
        // Refs to matches that do exist are kept
        expect(bracket?.upper.find((m) => m.id === 1)?.nextMatchId).toBe(2)
    })
})
