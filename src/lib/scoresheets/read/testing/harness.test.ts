import jsQR from "jsqr"
import { describe, expect, it, vi } from "vitest"

import { TEMPLATE_VERSION } from "../../sheet-config"
import { grayToRgba, type RasterImage } from "../image"
import { distort } from "./distort"
import { synthesizeSheet } from "./synthesize"

/** The 3000px upload ceiling, in pixels per point. */
const NEW_SCALE = 3000 / 792

function decode(img: RasterImage) {
    return jsQR(grayToRgba(img), img.width, img.height, {
        inversionAttempts: "dontInvert"
    })
}

/**
 * These tests synthesize and warp multi-megapixel pages in pure JavaScript,
 * which is inherently slower than the 5-second default allows for on a CI
 * runner. The work is bounded and deliberate, so the ceiling is raised rather
 * than the coverage cut.
 */
vi.setConfig({ testTimeout: 60_000 })

describe("synthesized sheets", () => {
    it("carries a tag the decoder can read", async () => {
        const sheet = await synthesizeSheet({
            matchCount: 3,
            eventType: "regular_season",
            scale: NEW_SCALE,
            court: 1
        })
        expect(decode(sheet.image)?.data).toBe(sheet.truth.tag)
        expect(sheet.truth.tag).toBe(
            `BSD${TEMPLATE_VERSION}:F26:W3:2026-10-05:1`
        )
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

describe("synthesized tally", () => {
    it("prints the point numbers that crowd the FINAL boxes", async () => {
        // On paper the tally sits a couple of points above the FINAL boxes.
        // A reader that misjudges where the boxes are reads these instead,
        // so a harness without them cannot catch that mistake.
        const sheet = await synthesizeSheet({
            matchCount: 3,
            eventType: "regular_season",
            scale: NEW_SCALE
        })
        const tally = sheet.geometry.games[0].tally
        let dark = 0
        let total = 0
        for (let y = tally.y; y < tally.y + tally.h; y += 0.25) {
            for (let x = tally.x; x < tally.x + tally.w; x += 0.25) {
                const px = Math.round(x * sheet.scale)
                const py = Math.round((792 - y) * sheet.scale)
                if (sheet.image.gray[py * sheet.image.width + px] < 128) dark++
                total++
            }
        }
        expect(dark / total).toBeGreaterThan(0.03)
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
        // Reproducibility does not depend on resolution, so this runs small:
        // a failure here is about the random source, not the imaging.
        const sheet = await synthesizeSheet({
            matchCount: 2,
            eventType: "regular_season",
            scale: 1
        })
        const a = distort(sheet.image, { seed: 3, perspective: 0.04 })
        const b = distort(sheet.image, { seed: 3, perspective: 0.04 })
        expect(a.image.gray).toEqual(b.image.gray)
    })

    it("bends the middle of a folded page but not its corners", async () => {
        // A sheet folded in half and photographed on a lap: the marks stay
        // where a flat page would put them, the middle does not. This is the
        // shape the first real folded photographs had.
        const sheet = await synthesizeSheet({
            matchCount: 3,
            eventType: "regular_season",
            scale: 1
        })
        const flat = distort(sheet.image, { seed: 5, perspective: 0.02 })
        const folded = distort(sheet.image, {
            seed: 5,
            perspective: 0.02,
            curl: 0.035
        })

        const moved = (x: number, y: number) => {
            const a = flat.truthPoint({ x, y })
            const b = folded.truthPoint({ x, y })
            return Math.hypot(a.x - b.x, a.y - b.y)
        }
        const w = sheet.image.width
        const h = sheet.image.height

        for (const [x, y] of [
            [0, 0],
            [w, 0],
            [w, h],
            [0, h]
        ]) {
            expect(moved(x, y)).toBeLessThan(0.5)
        }
        // A FINAL box in the first match sits about a third of the way down
        expect(moved(w * 0.42, h * 0.34)).toBeGreaterThan(12)
    })

    it("draws content where truthPoint says it went", async () => {
        const sheet = await synthesizeSheet({
            matchCount: 3,
            eventType: "regular_season",
            scale: 2
        })
        const { image, truthPoint } = distort(sheet.image, {
            seed: 9,
            perspective: 0.02,
            curl: 0.035
        })
        const fiducialCentre = (index: number) => {
            const f = sheet.geometry.fiducials[index]
            return {
                x: (f.x + f.w / 2) * sheet.scale,
                y: (792 - f.y - f.h / 2) * sheet.scale
            }
        }
        // A solid printed mark must still be ink where it is said to be
        for (let i = 0; i < 4; i++) {
            const p = truthPoint(fiducialCentre(i))
            const v =
                image.gray[Math.round(p.y) * image.width + Math.round(p.x)]
            expect(v).toBeLessThan(60)
        }
        // And so must a FINAL box border in the bent middle of the page
        const box = sheet.geometry.games[0].finalDigits[0]
        const edge = truthPoint({
            x: box.x * sheet.scale,
            y: (792 - box.y - box.h / 2) * sheet.scale
        })
        const v =
            image.gray[Math.round(edge.y) * image.width + Math.round(edge.x)]
        expect(v).toBeLessThan(120)
    })
})
