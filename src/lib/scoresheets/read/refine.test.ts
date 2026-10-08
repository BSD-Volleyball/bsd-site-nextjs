import { describe, expect, it, vi } from "vitest"

import type { BoxRect, SheetGeometry } from "../layout"
import type { SheetEventType } from "../types"
import { cropId } from "./crops"
import { applyH, type Matrix3, type Point } from "./homography"
import { locatePage } from "./locate"
import { refineGameBoxes } from "./refine"
import { distort } from "./testing/distort"
import { type GameTruth, synthesizeSheet } from "./testing/synthesize"

const SCALE = 3000 / 792

vi.setConfig({ testTimeout: 60_000 })

function scoresFor(matchIds: number[]): GameTruth[] {
    return matchIds.flatMap((matchId) => [
        { matchId, team: "home", game: 1, score: 25, win: true },
        { matchId, team: "away", game: 1, score: 18, win: false },
        { matchId, team: "home", game: 2, score: 7, win: false },
        { matchId, team: "away", game: 2, score: 25, win: true }
    ])
}

async function photograph(opts: {
    matchCount: 3 | 4
    eventType: SheetEventType
    curl: number
    seed: number
    whiteOut?: (geometry: SheetGeometry) => BoxRect[]
}) {
    const matchIds = Array.from({ length: opts.matchCount }, (_, i) => 900 + i)
    const sheet = await synthesizeSheet({
        matchCount: opts.matchCount,
        eventType: opts.eventType,
        scale: SCALE,
        scores: scoresFor(matchIds)
    })
    // Paper torn off, or a thumb over the boxes: nothing printed is left.
    for (const rect of opts.whiteOut?.(sheet.geometry) ?? []) {
        const x0 = Math.floor(rect.x * SCALE)
        const x1 = Math.ceil((rect.x + rect.w) * SCALE)
        const y0 = Math.floor((792 - rect.y - rect.h) * SCALE)
        const y1 = Math.ceil((792 - rect.y) * SCALE)
        for (let y = y0; y <= y1; y++) {
            sheet.image.gray.fill(
                255,
                y * sheet.image.width + x0,
                y * sheet.image.width + x1
            )
        }
    }
    const photo = distort(sheet.image, {
        seed: opts.seed,
        perspective: 0.025,
        rotationDeg: 4,
        blurSigma: 1,
        noiseSigma: 4,
        shading: 0.25,
        curl: opts.curl
    })
    const transform = locatePage(photo.image)
    if (!transform) throw new Error("page not located")
    return { sheet, photo, toImage: transform.toImage }
}

function centre(box: BoxRect): Point {
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
}

/** Distance in page points between where a box was drawn and where we look. */
function miss(
    box: BoxRect,
    drawn: BoxRect,
    toImage: Matrix3,
    truthPoint: (p: Point) => Point
): number {
    const c = centre(drawn)
    const truth = truthPoint({ x: c.x * SCALE, y: (792 - c.y) * SCALE })
    const looked = applyH(toImage, centre(box))
    return Math.hypot(truth.x - looked.x, truth.y - looked.y) / SCALE
}

function worstMiss(
    looked: SheetGeometry,
    drawn: SheetGeometry,
    toImage: Matrix3,
    truthPoint: (p: Point) => Point,
    pick: (g: SheetGeometry["games"][number]) => BoxRect[]
): number {
    let worst = 0
    looked.games.forEach((game, i) => {
        pick(game).forEach((box, j) => {
            const d = miss(box, pick(drawn.games[i])[j], toImage, truthPoint)
            worst = Math.max(worst, d)
        })
    })
    return worst
}

describe("refineGameBoxes", () => {
    it("finds every FINAL box on a page folded in half", async () => {
        const { sheet, photo, toImage } = await photograph({
            matchCount: 3,
            eventType: "regular_season",
            curl: 0.035,
            seed: 11
        })

        // Without refinement the flat-page fit misses by more than a box
        // width somewhere, which is the bug this exists to fix.
        expect(
            worstMiss(
                sheet.geometry,
                sheet.geometry,
                toImage,
                photo.truthPoint,
                (g) => g.finalDigits
            )
        ).toBeGreaterThan(8)

        const refined = refineGameBoxes(photo.image, toImage, sheet.geometry)
        expect(refined.unlocated.size).toBe(0)
        expect(
            worstMiss(
                refined.geometry,
                sheet.geometry,
                toImage,
                photo.truthPoint,
                (g) => g.finalDigits
            )
        ).toBeLessThan(1.5)
    })

    it("moves the WIN box with its digits", async () => {
        const { sheet, photo, toImage } = await photograph({
            matchCount: 3,
            eventType: "regular_season",
            curl: 0.035,
            seed: 12
        })
        const refined = refineGameBoxes(photo.image, toImage, sheet.geometry)
        expect(
            worstMiss(
                refined.geometry,
                sheet.geometry,
                toImage,
                photo.truthPoint,
                (g) => [g.win]
            )
        ).toBeLessThan(1.5)
    })

    it("leaves a flat page's boxes where they already were", async () => {
        const { sheet, photo, toImage } = await photograph({
            matchCount: 3,
            eventType: "regular_season",
            curl: 0,
            seed: 13
        })
        const refined = refineGameBoxes(photo.image, toImage, sheet.geometry)
        expect(refined.unlocated.size).toBe(0)
        expect(
            worstMiss(
                refined.geometry,
                sheet.geometry,
                toImage,
                photo.truthPoint,
                (g) => [...g.finalDigits, g.win]
            )
        ).toBeLessThan(1)
    })

    it("does not jump to the next team's boxes on a crowded playoff page", async () => {
        // Four matches leave 44pt between one team's FINAL row and the next,
        // the tightest spacing any sheet has.
        const { sheet, photo, toImage } = await photograph({
            matchCount: 4,
            eventType: "playoff",
            curl: 0.025,
            seed: 14
        })
        const refined = refineGameBoxes(photo.image, toImage, sheet.geometry)
        expect(refined.unlocated.size).toBe(0)
        expect(
            worstMiss(
                refined.geometry,
                sheet.geometry,
                toImage,
                photo.truthPoint,
                (g) => g.finalDigits
            )
        ).toBeLessThan(1.5)
    })

    it("admits a game whose boxes are not there rather than guessing", async () => {
        const { sheet, photo, toImage } = await photograph({
            matchCount: 3,
            eventType: "regular_season",
            curl: 0.02,
            seed: 15,
            whiteOut: (geometry) => {
                const game = geometry.games.find(
                    (g) =>
                        g.matchId === 901 && g.team === "away" && g.game === 2
                )
                if (!game) throw new Error("geometry missing")
                const [tens, ones] = game.finalDigits
                return [
                    {
                        x: tens.x - 3,
                        y: tens.y - 3,
                        w: game.win.x + game.win.w - tens.x + 6,
                        h: ones.h + 6
                    }
                ]
            }
        })
        const refined = refineGameBoxes(photo.image, toImage, sheet.geometry)
        expect([...refined.unlocated]).toEqual([cropId(901, "away", 2)])
    })

    it("keeps the digits when only the WIN box is lost", async () => {
        // Referees circle and scribble over the WIN box, which can hide its
        // printed outline completely. The digits are still readable; only
        // the tick cannot be trusted.
        const { sheet, photo, toImage } = await photograph({
            matchCount: 3,
            eventType: "regular_season",
            curl: 0.02,
            seed: 16,
            whiteOut: (geometry) => {
                const game = geometry.games.find(
                    (g) =>
                        g.matchId === 900 && g.team === "home" && g.game === 1
                )
                if (!game) throw new Error("geometry missing")
                return [
                    {
                        x: game.win.x - 1.5,
                        y: game.win.y - 1.5,
                        w: game.win.w + 3,
                        h: game.win.h + 3
                    }
                ]
            }
        })
        const refined = refineGameBoxes(photo.image, toImage, sheet.geometry)
        expect(refined.unlocated.size).toBe(0)
        expect([...refined.uncheckedWins]).toEqual([cropId(900, "home", 1)])
    })

    it("is never confidently in the wrong place across seeds", async () => {
        // A game reported found must be on its boxes. Not finding one is
        // safe; finding the printed tally numbers instead is how the first
        // folded photographs produced confident wrong scores. Hand-picked
        // seeds passed while this sweep found three separate ways to fail.
        const wrong: string[] = []
        for (const [matchCount, eventType] of [
            [3, "regular_season"],
            [4, "playoff"]
        ] as const) {
            for (const seed of [2, 3, 5, 7]) {
                const { sheet, photo, toImage } = await photograph({
                    matchCount,
                    eventType,
                    curl: 0.035,
                    seed
                })
                const refined = refineGameBoxes(
                    photo.image,
                    toImage,
                    sheet.geometry
                )
                refined.geometry.games.forEach((game, i) => {
                    const id = cropId(game.matchId, game.team, game.game)
                    if (refined.unlocated.has(id)) return
                    const drawn = sheet.geometry.games[i]
                    const d = Math.max(
                        ...game.finalDigits.map((box, j) =>
                            miss(
                                box,
                                drawn.finalDigits[j],
                                toImage,
                                photo.truthPoint
                            )
                        )
                    )
                    if (d > 1.5) wrong.push(`${eventType} ${seed} ${id} ${d}`)
                })
            }
        }
        expect(wrong).toEqual([])
    }, 120_000)
})
