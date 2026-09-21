import jsQR from "jsqr"
import { describe, expect, it } from "vitest"

import { grayToRgba, type RasterImage } from "../image"
import { distort } from "./distort"
import { synthesizeSheet } from "./synthesize"

/** Old 1280px upload vs the new 3000px one, in pixels per point. */
const OLD_SCALE = 1280 / 792
const NEW_SCALE = 3000 / 792

function decode(img: RasterImage) {
    return jsQR(grayToRgba(img), img.width, img.height, {
        inversionAttempts: "dontInvert"
    })
}

describe("synthesized sheets", () => {
    it("carries a tag the decoder can read", async () => {
        const sheet = await synthesizeSheet({
            matchCount: 3,
            eventType: "regular_season",
            scale: NEW_SCALE,
            court: 1
        })
        expect(decode(sheet.image)?.data).toBe(sheet.truth.tag)
        expect(sheet.truth.tag).toBe("BSD2:F26:W3:2026-10-05:1")
    })

    it("records exactly what it drew", async () => {
        const sheet = await synthesizeSheet({
            matchCount: 2,
            eventType: "regular_season",
            scale: NEW_SCALE,
            scores: [
                {
                    matchId: 900,
                    team: "home",
                    game: 1,
                    score: 25,
                    win: true
                },
                {
                    matchId: 900,
                    team: "away",
                    game: 1,
                    score: 19,
                    win: false
                }
            ]
        })

        // Two matches, two teams, three games
        expect(sheet.truth.games).toHaveLength(12)
        const scored = sheet.truth.games.filter((g) => g.score !== null)
        expect(scored).toHaveLength(2)
        expect(sheet.truth.games.filter((g) => g.win)).toHaveLength(1)
    })

    it("puts ink inside the boxes it says it filled", async () => {
        const sheet = await synthesizeSheet({
            matchCount: 3,
            eventType: "regular_season",
            scale: NEW_SCALE,
            scores: [
                { matchId: 900, team: "home", game: 1, score: 25, win: true }
            ]
        })

        const meanInside = (box: {
            x: number
            y: number
            w: number
            h: number
        }) => {
            // Inset well past the printed border so only handwriting counts
            const inset = 0.3
            let total = 0
            let n = 0
            for (let i = 0; i < 20; i++) {
                for (let j = 0; j < 20; j++) {
                    const pageX =
                        box.x + box.w * (inset + ((1 - inset * 2) * j) / 19)
                    const pageY =
                        box.y + box.h * (inset + ((1 - inset * 2) * i) / 19)
                    const x = Math.round(pageX * sheet.scale)
                    const y = Math.round((792 - pageY) * sheet.scale)
                    total += sheet.image.gray[y * sheet.image.width + x]
                    n++
                }
            }
            return total / n
        }

        const filled = sheet.geometry.games.find(
            (g) => g.matchId === 900 && g.team === "home" && g.game === 1
        )
        const empty = sheet.geometry.games.find(
            (g) => g.matchId === 900 && g.team === "home" && g.game === 3
        )
        if (!filled || !empty) throw new Error("geometry missing")

        // A written box is clearly darker than an untouched one
        expect(meanInside(filled.finalDigits[1])).toBeLessThan(220)
        expect(meanInside(empty.finalDigits[1])).toBeGreaterThan(250)
        expect(meanInside(filled.win)).toBeLessThan(230)
        expect(meanInside(empty.win)).toBeGreaterThan(250)
    })
})

describe("distortion", () => {
    it("keeps the tag readable through a realistic photo", async () => {
        const sheet = await synthesizeSheet({
            matchCount: 4,
            eventType: "playoff",
            scale: NEW_SCALE
        })
        const { image } = distort(sheet.image, {
            seed: 7,
            perspective: 0.03,
            rotationDeg: 4,
            blurSigma: 1,
            noiseSigma: 4,
            shading: 0.25
        })
        expect(decode(image)?.data).toBe(sheet.truth.tag)
    })

    it("is deterministic for a seed", async () => {
        const sheet = await synthesizeSheet({
            matchCount: 2,
            eventType: "regular_season",
            scale: OLD_SCALE
        })
        const a = distort(sheet.image, { seed: 3, perspective: 0.04 })
        const b = distort(sheet.image, { seed: 3, perspective: 0.04 })
        expect(a.image.gray).toEqual(b.image.gray)
    })
})
