import { describe, expect, it, vi } from "vitest"

import { cropId } from "./crops"
import { readSheet } from "./read"
import { distort } from "./testing/distort"
import { type GameTruth, synthesizeSheet } from "./testing/synthesize"
import { nullTranscriber, stubTranscriber } from "./transcriber/stub"

const SCALE = 3000 / 792
const MATCH_IDS = [900, 901, 902]

/** Two straight games to the home side, a third left unplayed. */
function twoNil(matchId: number): GameTruth[] {
    return [
        { matchId, team: "home", game: 1, score: 25, win: true },
        { matchId, team: "away", game: 1, score: 19, win: false },
        { matchId, team: "home", game: 2, score: 25, win: true },
        { matchId, team: "away", game: 2, score: 21, win: false }
    ]
}

async function photograph(opts: {
    scores: GameTruth[]
    seed: number
    matchCount?: 1 | 2 | 3 | 4
}) {
    const sheet = await synthesizeSheet({
        matchCount: opts.matchCount ?? 3,
        eventType: "regular_season",
        scale: SCALE,
        scores: opts.scores
    })
    const { image } = distort(sheet.image, {
        seed: opts.seed,
        perspective: 0.025,
        rotationDeg: 4,
        blurSigma: 1,
        noiseSigma: 4,
        shading: 0.25
    })
    const truth = new Map<string, number | null>(
        sheet.truth.games.map((g) => [
            cropId(g.matchId, g.team, g.game),
            g.score
        ])
    )
    return { image, sheet, truth }
}

/**
 * These tests synthesize and warp multi-megapixel pages in pure JavaScript,
 * which is inherently slower than the 5-second default allows for on a CI
 * runner. The work is bounded and deliberate, so the ceiling is raised rather
 * than the coverage cut.
 */
vi.setConfig({ testTimeout: 60_000 })

describe("readSheet", () => {
    it("recovers a whole night's scores from a photo", async () => {
        const scores = MATCH_IDS.flatMap(twoNil)
        const { image, sheet, truth } = await photograph({ scores, seed: 101 })

        const result = await readSheet({
            image,
            matchIds: MATCH_IDS,
            eventType: "regular_season",
            transcriber: stubTranscriber({ truth })
        })

        expect(result.status).toBe("read")
        expect(result.tag).toBe(sheet.truth.tag)
        expect(result.problems).toEqual([])
        expect(result.matches).toHaveLength(3)

        for (const match of result.matches) {
            expect(match.homeGamesWon).toBe(2)
            expect(match.awayGamesWon).toBe(0)
            expect(match.winner).toBe("home")
            expect(match.games[0]).toMatchObject({
                home: 25,
                away: 19,
                level: "high"
            })
            expect(match.games[2].blank).toBe(true)
        }
    })

    it("never shows an empty game to the transcriber", async () => {
        const scores = twoNil(900)
        const { image, truth } = await photograph({ scores, seed: 102 })

        const asked: string[] = []
        const spy = stubTranscriber({ truth })
        const result = await readSheet({
            image,
            matchIds: MATCH_IDS,
            eventType: "regular_season",
            transcriber: {
                name: "spy",
                async transcribe(crops, signal) {
                    asked.push(...crops.map((c) => c.id))
                    return spy.transcribe(crops, signal)
                }
            }
        })

        // Only match 900's first two games were written in
        expect(asked.sort()).toEqual(
            [
                cropId(900, "home", 1),
                cropId(900, "away", 1),
                cropId(900, "home", 2),
                cropId(900, "away", 2)
            ].sort()
        )
        // The untouched matches come back blank, not invented
        const untouched = result.matches.filter((m) => m.matchId !== 900)
        for (const match of untouched) {
            expect(match.games.every((g) => g.blank)).toBe(true)
        }
    })

    it("catches a transcriber that misreads a digit", async () => {
        const scores = twoNil(900)
        const { image, truth } = await photograph({ scores, seed: 103 })

        const result = await readSheet({
            image,
            matchIds: MATCH_IDS,
            eventType: "regular_season",
            // Claim the home side scored 24, which cannot beat 19
            transcriber: stubTranscriber({
                truth,
                corrupt: new Map([[cropId(900, "home", 1), 24]])
            })
        })

        const game = result.matches[0].games[0]
        // Either corrected by the rules and the tick, or flagged. Never 24.
        expect(game.home).not.toBe(24)
        if (game.level === "high") expect(game.home).toBe(25)
        else expect(result.problems.length).toBeGreaterThan(0)
    })

    it("still reads the ticks when no model is available", async () => {
        const scores = twoNil(900)
        const { image } = await photograph({ scores, seed: 104 })

        const result = await readSheet({
            image,
            matchIds: MATCH_IDS,
            eventType: "regular_season",
            transcriber: nullTranscriber
        })

        // No digits, so no scoreline, but the sheet is still identified and
        // the admin gets a partly filled form rather than nothing.
        expect(result.tag).not.toBeNull()
        expect(result.status).toBe("needs_review")
        expect(result.crops.length).toBeGreaterThan(0)
    })

    it("survives a transcriber that throws", async () => {
        const scores = twoNil(900)
        const { image } = await photograph({ scores, seed: 105 })

        const result = await readSheet({
            image,
            matchIds: MATCH_IDS,
            eventType: "regular_season",
            transcriber: stubTranscriber({ truth: new Map(), fail: true })
        })

        expect(result.transcriber).toContain("failed")
        expect(result.problems.join(" ")).toContain("could not be read")
        expect(result.tag).not.toBeNull()
    })

    it("calls a played game unreadable, not blank, when the model fails", async () => {
        // Scores written, WIN left unticked — which is most of a real sheet,
        // since referees tick it inconsistently and a faint tick does not
        // always survive a photograph. With no tick and no digits, every
        // signal that a game happened comes from the ink in the boxes.
        const scores: GameTruth[] = [
            { matchId: 900, team: "home", game: 1, score: 25, win: false },
            { matchId: 900, team: "away", game: 1, score: 19, win: false },
            { matchId: 900, team: "home", game: 2, score: 25, win: false },
            { matchId: 900, team: "away", game: 2, score: 21, win: false }
        ]
        const { image } = await photograph({ scores, seed: 211 })

        const result = await readSheet({
            image,
            matchIds: MATCH_IDS,
            eventType: "regular_season",
            transcriber: stubTranscriber({ truth: new Map(), fail: true })
        })

        // The failure that matters is not losing the digits, which is
        // survivable and says so. It is announcing "these games were never
        // played" at full confidence, which is what a sixty-second timeout
        // did the first time real photographs went through.
        for (const game of result.matches[0].games.slice(0, 2)) {
            expect(game.blank).toBe(false)
            expect(game.level).toBe("unreadable")
        }
    })

    it("reports a photo it cannot place instead of guessing", async () => {
        const blank = {
            width: 600,
            height: 800,
            gray: new Uint8Array(600 * 800).fill(240)
        }
        const result = await readSheet({
            image: blank,
            matchIds: MATCH_IDS,
            eventType: "regular_season",
            transcriber: nullTranscriber
        })
        expect(result.status).toBe("not_located")
        expect(result.matches).toEqual([])
    })

    it("is never confidently wrong across seeds and scorelines", async () => {
        const lines: { home: number; away: number }[] = [
            { home: 25, away: 19 },
            { home: 21, away: 25 },
            { home: 27, away: 25 },
            { home: 26, away: 24 }
        ]

        const confidentlyWrong: string[] = []
        let highFields = 0

        for (const [i, line] of lines.entries()) {
            const matchId = 900
            const homeWon = line.home > line.away
            const scores: GameTruth[] = [
                {
                    matchId,
                    team: "home",
                    game: 1,
                    score: line.home,
                    win: homeWon
                },
                {
                    matchId,
                    team: "away",
                    game: 1,
                    score: line.away,
                    win: !homeWon
                }
            ]
            const { image, truth } = await photograph({
                scores,
                seed: 200 + i,
                matchCount: 2
            })

            const result = await readSheet({
                image,
                matchIds: [900, 901],
                eventType: "regular_season",
                transcriber: stubTranscriber({ truth, confidence: 0.9 })
            })

            const game = result.matches[0].games[0]
            if (game.level !== "high") continue
            highFields++
            if (game.home !== line.home || game.away !== line.away) {
                confidentlyWrong.push(
                    `${line.home}-${line.away} read ${game.home}-${game.away}`
                )
            }
        }

        expect(confidentlyWrong).toEqual([])
        expect(highFields).toBeGreaterThan(0)
    }, 60_000)
})
