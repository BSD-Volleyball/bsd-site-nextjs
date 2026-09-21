import { describe, expect, it } from "vitest"

import type { CheckReading } from "./checkbox"
import { reconcileGame, reconcileMatch, type ScoreCandidate } from "./reconcile"
import { gameConstraint } from "./rules"

const REGULAR = gameConstraint("regular_season", 1)
const PLAYOFF = gameConstraint("playoff", 1)

const marked: CheckReading = {
    inkRatio: 0.45,
    state: "marked",
    confidence: 0.95
}
const unmarked: CheckReading = {
    inkRatio: 0.02,
    state: "unmarked",
    confidence: 0.95
}
const unsure: CheckReading = {
    inkRatio: 0.18,
    state: "ambiguous",
    confidence: 0.25
}

const read = (
    value: number,
    confidence = 0.95,
    alternatives?: { value: number; confidence: number }[]
): ScoreCandidate => ({ value, confidence, alternatives })

describe("reconcileGame", () => {
    it("accepts a clean, consistent game", () => {
        const v = reconcileGame({
            constraint: REGULAR,
            home: read(25),
            away: read(19),
            homeWin: marked,
            awayWin: unmarked
        })
        expect(v).toMatchObject({
            home: 25,
            away: 19,
            winner: "home",
            level: "high",
            conflict: null
        })
        expect(v.confidence).toBeGreaterThan(0.95)
    })

    it("treats an untouched game as a confident blank", () => {
        const v = reconcileGame({
            constraint: REGULAR,
            home: null,
            away: null,
            homeWin: unmarked,
            awayWin: unmarked
        })
        expect(v.blank).toBe(true)
        expect(v.level).toBe("high")
        expect(v.home).toBeNull()
    })

    it("uses the tick to settle an ambiguous digit", () => {
        // The transcriber cannot decide between 25 and 26 for the home side
        const v = reconcileGame({
            constraint: REGULAR,
            home: read(26, 0.45, [{ value: 25, confidence: 0.44 }]),
            away: read(23, 0.9),
            homeWin: marked,
            awayWin: unmarked
        })
        // 26-23 is not a legal ending; 25-23 is
        expect(v.home).toBe(25)
        expect(v.away).toBe(23)
        expect(v.winner).toBe("home")
    })

    it("rejects an illegal reading in favour of a legal one", () => {
        const v = reconcileGame({
            constraint: REGULAR,
            home: read(25, 0.9),
            away: read(24, 0.9),
            homeWin: marked,
            awayWin: unmarked
        })
        // 25-24 cannot happen; the nearest legal endings win out
        expect(v.home === 25 && v.away === 24).toBe(false)
        expect(v.level).not.toBe("high")
    })

    it("flags a tick that contradicts the scores", () => {
        const v = reconcileGame({
            constraint: REGULAR,
            home: read(19),
            away: read(25),
            homeWin: marked,
            awayWin: unmarked
        })
        expect(v.conflict).toContain("WIN tick")
        expect(v.level).not.toBe("high")
    })

    it("flags both sides ticked", () => {
        const v = reconcileGame({
            constraint: REGULAR,
            home: read(25),
            away: read(19),
            homeWin: marked,
            awayWin: marked
        })
        expect(v.conflict).toContain("Both teams")
        expect(v.level).not.toBe("high")
    })

    it("does not invent a score from a hallucinated digit alone", () => {
        // Ink density found nothing, so nothing was sent to the transcriber;
        // a stray tick is not enough to claim a scoreline.
        const v = reconcileGame({
            constraint: REGULAR,
            home: null,
            away: null,
            homeWin: marked,
            awayWin: unmarked
        })
        expect(v.level).not.toBe("high")
    })

    it("respects the playoff floor when choosing a reading", () => {
        const v = reconcileGame({
            constraint: PLAYOFF,
            home: read(25, 0.9),
            away: read(2, 0.9),
            homeWin: marked,
            awayWin: unmarked
        })
        // Playoff games start at 4-4, so 2 is impossible
        expect(v.away).not.toBe(2)
    })

    it("stays cautious when the ticks are unreadable", () => {
        const decisive = reconcileGame({
            constraint: REGULAR,
            home: read(25),
            away: read(19),
            homeWin: marked,
            awayWin: unmarked
        })
        const murky = reconcileGame({
            constraint: REGULAR,
            home: read(25, 0.5, [{ value: 26, confidence: 0.45 }]),
            away: read(19, 0.5, [{ value: 18, confidence: 0.45 }]),
            homeWin: unsure,
            awayWin: unsure
        })
        expect(murky.confidence).toBeLessThan(decisive.confidence)
    })
})

describe("the safety property", () => {
    /**
     * The whole design rests on this: a field offered at high confidence must
     * never be wrong. Sweep every legal scoreline, feed the transcriber's
     * answer through with varying amounts of error, and assert that whenever
     * reconciliation claims certainty it is telling the truth.
     */
    it("is never confidently wrong across every legal scoreline", () => {
        const wrong: string[] = []
        let highCount = 0

        for (const constraint of [REGULAR, PLAYOFF]) {
            for (const pair of [
                { winner: 25, loser: 23 },
                { winner: 25, loser: 12 },
                { winner: 26, loser: 24 },
                { winner: 27, loser: 25 }
            ]) {
                if (constraint === PLAYOFF && pair.loser < constraint.floor) {
                    continue
                }
                for (const homeWon of [true, false]) {
                    const home = homeWon ? pair.winner : pair.loser
                    const away = homeWon ? pair.loser : pair.winner

                    for (const noise of [0, 1, 10]) {
                        const v = reconcileGame({
                            constraint,
                            home: read(home + noise, noise === 0 ? 0.97 : 0.6, [
                                { value: home, confidence: 0.35 }
                            ]),
                            away: read(away, 0.95),
                            homeWin: homeWon ? marked : unmarked,
                            awayWin: homeWon ? unmarked : marked
                        })

                        if (v.level !== "high") continue
                        highCount++
                        if (v.home !== home || v.away !== away) {
                            wrong.push(
                                `${home}-${away} noise=${noise} read ${v.home}-${v.away}`
                            )
                        }
                    }
                }
            }
        }

        expect(wrong).toEqual([])
        // The guarantee is worthless if it never commits to anything
        expect(highCount).toBeGreaterThan(10)
    })
})

describe("reconcileMatch", () => {
    const clean = (homeWins: boolean) =>
        reconcileGame({
            constraint: REGULAR,
            home: read(homeWins ? 25 : 19),
            away: read(homeWins ? 19 : 25),
            homeWin: homeWins ? marked : unmarked,
            awayWin: homeWins ? unmarked : marked
        })
    const blank = () =>
        reconcileGame({
            constraint: REGULAR,
            home: null,
            away: null,
            homeWin: unmarked,
            awayWin: unmarked
        })

    it("counts games won rather than reading them", () => {
        const m = reconcileMatch([clean(true), clean(true), blank()])
        expect(m).toMatchObject({
            homeGamesWon: 2,
            awayGamesWon: 0,
            winner: "home"
        })
        expect(m.problems).toEqual([])
    })

    it("handles a three-game match", () => {
        const m = reconcileMatch([clean(true), clean(false), clean(true)])
        expect(m.homeGamesWon).toBe(2)
        expect(m.awayGamesWon).toBe(1)
        expect(m.winner).toBe("home")
    })

    it("complains about a match left level", () => {
        const m = reconcileMatch([clean(true), clean(false), blank()])
        expect(m.winner).toBeNull()
        expect(m.problems.join(" ")).toContain("level")
    })

    it("refuses totals when a played game could not be read", () => {
        const murky = reconcileGame({
            constraint: REGULAR,
            home: read(99, 0.3),
            away: read(98, 0.3),
            homeWin: unsure,
            awayWin: unsure
        })
        const m = reconcileMatch([clean(true), murky, blank()])
        expect(m.homeGamesWon).toBeNull()
        expect(m.winner).toBeNull()
        expect(m.problems.join(" ")).toContain("could not be read")
    })
})
