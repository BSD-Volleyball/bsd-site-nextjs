import { describe, expect, it } from "vitest"
import {
    isScoreEmpty,
    type MatchScoreValues,
    validateMatchScores
} from "./match-validation"

const sides = {
    homeTeamId: 1,
    awayTeamId: 2,
    homeTeamName: "Aces",
    awayTeamName: "Blockers"
}

const homeWins: MatchScoreValues = {
    homeScore: 2,
    awayScore: 1,
    homeSet1Score: 25,
    awaySet1Score: 20,
    homeSet2Score: 20,
    awaySet2Score: 25,
    homeSet3Score: 15,
    awaySet3Score: 10
}

const empty: MatchScoreValues = {
    homeScore: null,
    awayScore: null,
    homeSet1Score: null,
    awaySet1Score: null,
    homeSet2Score: null,
    awaySet2Score: null,
    homeSet3Score: null,
    awaySet3Score: null
}

describe("validateMatchScores", () => {
    it("accepts a complete, consistent result", () => {
        expect(validateMatchScores(homeWins, 1, sides)).toEqual([])
    })

    it("accepts an empty match, which is how a result is cleared", () => {
        expect(isScoreEmpty(empty, null)).toBe(true)
        expect(validateMatchScores(empty, null, sides)).toEqual([])
    })

    it("requires the winner and the first two games", () => {
        const problems = validateMatchScores(
            { ...empty, homeSet1Score: 25 },
            null,
            sides
        )
        expect(problems).toContain("Overall Winner must be selected")
        expect(problems).toContain("Game 1 Score (Away) is required")
        expect(problems).toContain("Game 2 Score (Home) is required")
    })

    it("requires game 3 when three games were played", () => {
        const problems = validateMatchScores(
            { ...homeWins, homeSet3Score: null, awaySet3Score: null },
            1,
            sides
        )
        expect(problems).toContain(
            "Game 3 Score (Home) is required when total games is 3"
        )
    })

    it("rejects totals that disagree with the games", () => {
        expect(
            validateMatchScores({ ...homeWins, homeScore: 3 }, 1, sides)
        ).toContain("Home Total Games Won is 3 but game scores show 2")
    })

    it("rejects a winner the games contradict", () => {
        expect(validateMatchScores(homeWins, 2, sides)).toContain(
            "Blockers is selected as winner but Home won more games from scores"
        )
    })
})
