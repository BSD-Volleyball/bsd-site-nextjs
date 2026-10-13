import { describe, expect, it } from "vitest"

import { combineGame, combineReadings } from "./combine"
import type { GameReading, PageReading } from "./page-reader"

const MODELS = ["google/gemini-4-argon", "openai/gpt-6.1-sol"]

function g(
    home: number | null,
    away: number | null,
    confidence: GameReading["confidence"] = "high",
    note = ""
): GameReading {
    return { home, away, confidence, note }
}

const combine = (...readings: GameReading[]) =>
    combineGame("regular_season", 1, readings, MODELS.slice(0, readings.length))

describe("combineGame", () => {
    it("offers a score both readers agree on without comment", () => {
        expect(combine(g(25, 22), g(25, 22, "medium"))).toEqual({
            home: 25,
            away: 22,
            winner: "home",
            confidence: 1,
            level: "high",
            conflict: null,
            blank: false
        })
    })

    it("names both readings when the readers disagree, and fills nothing", () => {
        const verdict = combine(g(22, 25), g(20, 25))
        expect(verdict.level).toBe("unreadable")
        expect(verdict.home).toBeNull()
        expect(verdict.conflict).toContain("gemini-4-argon read 22-25")
        expect(verdict.conflict).toContain("gpt-6.1-sol read 20-25")
    })

    it("never offers one reader's answer as certain", () => {
        const verdict = combine(g(25, 21, "high", "clear"))
        expect(verdict.level).toBe("low")
        expect(verdict.home).toBe(25)
        expect(verdict.conflict).toContain("Only one reader")
    })

    it("keeps an agreed score low when a reader was unsure, with its note", () => {
        const verdict = combine(g(25, 18), g(25, 18, "low", "8 is overwritten"))
        expect(verdict.level).toBe("low")
        expect(verdict.winner).toBe("home")
        expect(verdict.conflict).toContain("8 is overwritten")
    })

    it("lets the rules veto a score both readers agree on", () => {
        const verdict = combine(g(25, 24), g(25, 24))
        expect(verdict.level).toBe("low")
        expect(verdict.conflict).toContain("not a possible final score")
    })

    it("accepts the capped 27-26 finish", () => {
        expect(combine(g(27, 26), g(27, 26)).level).toBe("high")
    })

    it("agrees a game was not played only when both are sure", () => {
        expect(combine(g(null, null), g(null, null))).toMatchObject({
            blank: true,
            level: "high"
        })
        // A faint score read as nothing is how a played game disappears.
        expect(combine(g(null, null), g(null, null, "low")).level).toBe(
            "unreadable"
        )
        expect(combine(g(null, null)).level).toBe("unreadable")
    })

    it("keeps the half of a game that could be read", () => {
        const verdict = combine(g(null, 25), g(null, 25))
        expect(verdict.level).toBe("unreadable")
        expect(verdict.away).toBe(25)
        expect(verdict.home).toBeNull()
    })

    it("treats a game no reader answered as unreadable", () => {
        expect(combine().level).toBe("unreadable")
    })
})

describe("combineReadings", () => {
    const reading = (model: string, games: GameReading[][]): PageReading => ({
        model,
        sheetCode: "F26-W5-C1",
        matches: games
    })

    it("counts games won from agreed games", () => {
        const games = [[g(25, 19), g(21, 25), g(25, 23)]]
        const [match] = combineReadings("regular_season", 1, [
            reading(MODELS[0], games),
            reading(MODELS[1], games)
        ])
        expect(match.homeGamesWon).toBe(2)
        expect(match.awayGamesWon).toBe(1)
        expect(match.winner).toBe("home")
        expect(match.problems).toEqual([])
    })

    it("withholds the totals while any game is unsettled", () => {
        const [match] = combineReadings("regular_season", 1, [
            reading(MODELS[0], [[g(25, 19), g(25, 21), g(null, null)]]),
            reading(MODELS[1], [[g(25, 19), g(25, 11), g(null, null)]])
        ])
        expect(match.homeGamesWon).toBeNull()
        expect(match.winner).toBeNull()
        expect(match.problems[0]).toMatch(/^Game 2: The two readers disagree/)
    })
})
