import { describe, expect, it } from "vitest"
import type {
    DivisionMatchGroup,
    MatchScoreData
} from "../enter-scores/actions"
import {
    courtForms,
    courtMatchProblems,
    EMPTY_GAMES,
    type GameScores,
    gamesWon,
    scoreInputsByDivision
} from "./court-forms"

function match(
    matchId: number,
    overrides: Partial<MatchScoreData> = {}
): MatchScoreData {
    return {
        matchId,
        time: "19:00",
        court: 1,
        homeTeamId: 10,
        homeTeamName: "Aces",
        awayTeamId: 20,
        awayTeamName: "Blockers",
        homeScore: null,
        awayScore: null,
        homeSet1Score: null,
        awaySet1Score: null,
        homeSet2Score: null,
        awaySet2Score: null,
        homeSet3Score: null,
        awaySet3Score: null,
        winner: null,
        playoff: false,
        playoffMatchNum: null,
        homeSource: null,
        awaySource: null,
        scoresEnteredBy: null,
        scoresEnteredAt: null,
        ...overrides
    }
}

function division(
    divisionId: number,
    matches: MatchScoreData[]
): DivisionMatchGroup {
    return {
        divisionId,
        divisionName: `Division ${divisionId}`,
        matches,
        seedToTeamId: {},
        teamNameById: { 10: "Aces", 20: "Blockers", 30: "Cyclones" }
    }
}

function games(...pairs: [number, number][]): GameScores {
    const out = { ...EMPTY_GAMES }
    const keys = [
        ["homeSet1Score", "awaySet1Score"],
        ["homeSet2Score", "awaySet2Score"],
        ["homeSet3Score", "awaySet3Score"]
    ] as const
    pairs.forEach(([h, a], i) => {
        out[keys[i][0]] = String(h)
        out[keys[i][1]] = String(a)
    })
    return out
}

describe("courtForms", () => {
    it("works out games won and the winner from the games", () => {
        const divisions = [division(1, [match(1)])]
        const { forms } = courtForms(divisions, {
            1: games([25, 20], [20, 25], [15, 10])
        })
        expect(forms[1]).toMatchObject({
            homeScore: "2",
            awayScore: "1",
            winner: 10
        })
    })

    it("clears totals and winner when no game is entered", () => {
        const divisions = [
            division(1, [match(1, { winner: 10, homeScore: 2 })])
        ]
        const { forms } = courtForms(divisions, { 1: EMPTY_GAMES })
        expect(forms[1]).toMatchObject({
            homeScore: "",
            awayScore: "",
            winner: null
        })
    })

    it("resolves a 'Winner of M1' slot from the same court's first match", () => {
        const m1 = match(1, { playoff: true, playoffMatchNum: 1 })
        const m2 = match(2, {
            playoff: true,
            playoffMatchNum: 2,
            homeTeamId: null,
            homeTeamName: "TBD",
            awayTeamId: 30,
            awayTeamName: "Cyclones",
            homeSource: "W1",
            awaySource: "S3"
        })
        const divisions = [division(1, [m1, m2])]
        const { forms, resolved } = courtForms(divisions, {
            1: games([20, 25], [18, 25]),
            2: games([25, 15], [25, 19])
        })
        expect(forms[1].winner).toBe(20)
        expect(resolved.get(2)?.homeTeamName).toBe("Blockers")
        expect(forms[2].winner).toBe(20)
    })
})

describe("courtMatchProblems", () => {
    it("asks for the deciding game when the games are tied", () => {
        const divisions = [division(1, [match(1)])]
        const g = games([25, 20], [20, 25])
        const { forms, resolved } = courtForms(divisions, { 1: g })
        expect(courtMatchProblems(forms[1], resolved.get(1), g)).toEqual([
            "The games are tied. Enter the deciding game."
        ])
    })

    it("says to save the earlier court first when a slot is unresolved", () => {
        const m2 = match(2, {
            playoff: true,
            playoffMatchNum: 2,
            homeTeamId: null,
            homeTeamName: "TBD",
            homeSource: "W1",
            awaySource: "S3"
        })
        const divisions = [division(1, [m2])]
        const g = games([25, 15], [25, 19])
        const { forms, resolved } = courtForms(divisions, { 2: g })
        expect(courtMatchProblems(forms[2], resolved.get(2), g)[0]).toMatch(
            /Save that court first/
        )
    })

    it("has nothing to say about a valid result", () => {
        const divisions = [division(1, [match(1)])]
        const g = games([25, 20], [25, 22], [15, 9])
        const { forms, resolved } = courtForms(divisions, { 1: g })
        expect(courtMatchProblems(forms[1], resolved.get(1), g)).toEqual([])
    })
})

describe("scoreInputsByDivision", () => {
    it("splits a court spanning two divisions into one save each", () => {
        const divisions = [
            division(1, [match(1)]),
            division(2, [match(2), match(3, { court: 2 })])
        ]
        const { forms } = courtForms(divisions, {
            1: games([25, 20], [25, 22]),
            2: games([20, 25], [22, 25])
        })
        const groups = scoreInputsByDivision(divisions, [1, 2], forms)
        expect(
            groups.map((g) => [g.divisionId, g.inputs.map((i) => i.matchId)])
        ).toEqual([
            [1, [1]],
            [2, [2]]
        ])
        expect(groups[1].inputs[0]).toMatchObject({
            homeScore: 0,
            awayScore: 2,
            winner: 20
        })
    })
})

describe("gamesWon", () => {
    it("ignores a game with only one side entered", () => {
        expect(gamesWon({ ...games([25, 20]), homeSet2Score: "25" })).toEqual({
            home: 1,
            away: 0
        })
    })
})
