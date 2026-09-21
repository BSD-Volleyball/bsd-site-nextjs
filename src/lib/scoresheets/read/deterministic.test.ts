import { describe, expect, it, vi } from "vitest"

import { readCheckbox } from "./checkbox"
import { cropScoreBoxes } from "./crops"
import { geometryForPrint } from "./read"
import { parseSheetTag, readSheetTag } from "./identity"
import { locatePage } from "./locate"
import { distort } from "./testing/distort"
import { type GameTruth, synthesizeSheet } from "./testing/synthesize"

const SCALE = 3000 / 792

/** A plausible night: two games decided, a third left blank. */
function scores(matchIds: number[]): GameTruth[] {
    const out: GameTruth[] = []
    for (const [i, matchId] of matchIds.entries()) {
        const homeWinsFirst = i % 2 === 0
        out.push(
            {
                matchId,
                team: "home",
                game: 1,
                score: homeWinsFirst ? 25 : 21,
                win: homeWinsFirst
            },
            {
                matchId,
                team: "away",
                game: 1,
                score: homeWinsFirst ? 21 : 25,
                win: !homeWinsFirst
            },
            { matchId, team: "home", game: 2, score: 25, win: true },
            { matchId, team: "away", game: 2, score: 19, win: false }
        )
    }
    return out
}

/**
 * These tests synthesize and warp multi-megapixel pages in pure JavaScript,
 * which is inherently slower than the 5-second default allows for on a CI
 * runner. The work is bounded and deliberate, so the ceiling is raised rather
 * than the coverage cut.
 */
vi.setConfig({ testTimeout: 60_000 })

describe("parseSheetTag", () => {
    it("reads a regular-season tag", () => {
        expect(parseSheetTag("BSD2:F26:W3:2026-10-05:4")).toEqual({
            templateVersion: 2,
            seasonCode: "F26",
            phase: "W",
            ordinal: 3,
            date: "2026-10-05",
            court: 4
        })
    })

    it("reads a playoff tag and a court-less sheet", () => {
        expect(parseSheetTag("BSD2:S27:P1:2027-03-08:TBD")).toMatchObject({
            phase: "P",
            ordinal: 1,
            court: null
        })
    })

    it("rejects anything it does not fully understand", () => {
        for (const bad of [
            "",
            "BSD2:F26:W3:2026-10-05",
            "XXX2:F26:W3:2026-10-05:4",
            "BSD2:F26:X3:2026-10-05:4",
            "BSD2:F26:W3:05-10-2026:4",
            "BSD2:F26:W3:2026-10-05:court4"
        ]) {
            expect(parseSheetTag(bad)).toBeNull()
        }
    })
})

describe("reading a photographed sheet", () => {
    it("recovers the tag from a rectified page", async () => {
        const sheet = await synthesizeSheet({
            matchCount: 3,
            eventType: "regular_season",
            scale: SCALE,
            court: 2
        })
        const { image } = distort(sheet.image, {
            seed: 21,
            perspective: 0.03,
            rotationDeg: 6,
            blurSigma: 1,
            noiseSigma: 4,
            shading: 0.3
        })

        const transform = locatePage(image)
        expect(transform).not.toBeNull()
        if (!transform) return

        const identity = readSheetTag(image, transform, sheet.geometry.tagQr)
        expect(identity?.text).toBe(sheet.truth.tag)
        expect(identity?.parts.court).toBe(2)
        expect(identity?.parts.templateVersion).toBe(2)
    })

    it("recovers every WIN tick exactly", async () => {
        const matchIds = [900, 901, 902]
        const sheet = await synthesizeSheet({
            matchCount: 3,
            eventType: "regular_season",
            scale: SCALE,
            scores: scores(matchIds)
        })
        const { image } = distort(sheet.image, {
            seed: 33,
            perspective: 0.025,
            rotationDeg: -4,
            blurSigma: 1,
            noiseSigma: 4,
            shading: 0.25
        })

        const transform = locatePage(image)
        if (!transform) throw new Error("not located")

        const expected = new Map(
            sheet.truth.games.map((g) => [
                `${g.matchId}:${g.team}:${g.game}`,
                g.win
            ])
        )

        const wrong: string[] = []
        const ambiguous: string[] = []
        for (const game of sheet.geometry.games) {
            const key = `${game.matchId}:${game.team}:${game.game}`
            const reading = readCheckbox(image, transform.toImage, game.win)
            if (reading.state === "ambiguous") {
                ambiguous.push(key)
                continue
            }
            const marked = reading.state === "marked"
            if (marked !== expected.get(key)) {
                wrong.push(`${key} read ${reading.inkRatio.toFixed(3)}`)
            }
        }

        expect(wrong).toEqual([])
        expect(ambiguous).toEqual([])
    })

    it("separates ticked from untouched by a wide margin", async () => {
        const sheet = await synthesizeSheet({
            matchCount: 2,
            eventType: "regular_season",
            scale: SCALE,
            scores: [
                { matchId: 900, team: "home", game: 1, score: 25, win: true }
            ]
        })
        const { image } = distort(sheet.image, {
            seed: 44,
            perspective: 0.02,
            shading: 0.3
        })
        const transform = locatePage(image)
        if (!transform) throw new Error("not located")

        const ticked = sheet.geometry.games.find(
            (g) => g.matchId === 900 && g.team === "home" && g.game === 1
        )
        const untouched = sheet.geometry.games.find(
            (g) => g.matchId === 901 && g.team === "away" && g.game === 3
        )
        if (!ticked || !untouched) throw new Error("geometry missing")

        const a = readCheckbox(image, transform.toImage, ticked.win)
        const b = readCheckbox(image, transform.toImage, untouched.win)

        expect(a.state).toBe("marked")
        expect(b.state).toBe("unmarked")
        // A comfortable gap, not a coin flip either side of the threshold
        expect(a.inkRatio - b.inkRatio).toBeGreaterThan(0.2)
    })

    it("does not mistake the printed border for a tick", async () => {
        // Every box on a blank sheet is printed but empty
        const sheet = await synthesizeSheet({
            matchCount: 4,
            eventType: "playoff",
            scale: SCALE
        })
        const { image } = distort(sheet.image, {
            seed: 55,
            perspective: 0.03,
            rotationDeg: 7,
            shading: 0.3,
            noiseSigma: 5
        })
        const transform = locatePage(image)
        if (!transform) throw new Error("not located")

        for (const game of sheet.geometry.games) {
            for (const box of [game.win, ...game.timeouts]) {
                expect(readCheckbox(image, transform.toImage, box).state).toBe(
                    "unmarked"
                )
            }
        }
    })
})

describe("telling a written box from an empty one", () => {
    /**
     * This is the decision that stops a transcriber inventing scores, so the
     * margin behind it is worth pinning down rather than trusting.
     */
    it("separates ink from paper by a wide margin", async () => {
        const sheet = await synthesizeSheet({
            matchCount: 4,
            eventType: "playoff",
            scale: SCALE,
            scores: [
                // The sparsest realistic scores: one digit, tens box empty
                { matchId: 900, team: "home", game: 1, score: 7, win: false },
                { matchId: 900, team: "away", game: 1, score: 1, win: false },
                { matchId: 901, team: "home", game: 1, score: 25, win: true }
            ]
        })

        for (const seed of [11, 12, 13]) {
            const { image } = distort(sheet.image, {
                seed,
                perspective: 0.03,
                rotationDeg: 6,
                blurSigma: 1.5,
                noiseSigma: 6,
                shading: 0.35
            })
            const transform = locatePage(image)
            if (!transform) throw new Error("not located")

            const geometry = geometryForPrint([900, 901, 902, 903], "playoff")
            const { written, blank } = cropScoreBoxes(
                image,
                transform.toImage,
                geometry,
                "playoff"
            )

            // Exactly the three boxes that were written in
            expect(written).toHaveLength(3)
            expect(blank).toHaveLength(21)
            // Even a lone "1" stays well clear of the threshold
            expect(Math.min(...written.map((w) => w.inkRatio))).toBeGreaterThan(
                0.03
            )
        }
    }, 60_000)
})
