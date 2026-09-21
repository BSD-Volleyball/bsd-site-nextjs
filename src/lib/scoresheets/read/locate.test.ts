import { describe, expect, it } from "vitest"

import { buildFiducials } from "../layout"
import { applyH } from "./homography"
import { locatePage } from "./locate"
import { distort } from "./testing/distort"
import { synthesizeSheet } from "./testing/synthesize"

const NEW_SCALE = 3000 / 792
const OLD_SCALE = 1280 / 792
/**
 * The breadth sweep runs a full synthesize-distort-locate cycle per case, and
 * warping a 7-megapixel page is the expensive part. Locating is covered at
 * both 3000px and 1280px by the cases above, so the sweep trades resolution
 * for the number of distortions it can afford to try.
 */
const SWEEP_SCALE = 1900 / 792

/**
 * The transform is only useful if it lands on the right boxes, so assert in
 * page points: project a known page rect into the photo and back, and see how
 * far it moved. A digit box is 13pt, so an error near 1pt is comfortable and
 * an error of 5pt would be reading the neighbouring box.
 */
async function roundTripError(opts: {
    matchCount: 1 | 2 | 3 | 4
    scale: number
    seed: number
    perspective?: number
    rotationDeg?: number
    blurSigma?: number
    noiseSigma?: number
    shading?: number
}) {
    const sheet = await synthesizeSheet({
        matchCount: opts.matchCount,
        eventType: "regular_season",
        scale: opts.scale
    })
    const { image } = distort(sheet.image, {
        seed: opts.seed,
        perspective: opts.perspective,
        rotationDeg: opts.rotationDeg,
        blurSigma: opts.blurSigma,
        noiseSigma: opts.noiseSigma,
        shading: opts.shading
    })

    const transform = locatePage(image)
    if (!transform) return { transform: null, worst: Number.POSITIVE_INFINITY }

    // Every FINAL digit box, there and back again
    let worst = 0
    for (const game of sheet.geometry.games) {
        for (const box of game.finalDigits) {
            const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
            const inPhoto = applyH(transform.toImage, centre)
            const back = applyH(transform.toPage, inPhoto)
            worst = Math.max(
                worst,
                Math.hypot(back.x - centre.x, back.y - centre.y)
            )
        }
    }
    return { transform, worst, sheet }
}

describe("locatePage", () => {
    it("finds a flat, square-on page", async () => {
        const { transform, worst } = await roundTripError({
            matchCount: 3,
            scale: NEW_SCALE,
            seed: 1
        })
        expect(transform).not.toBeNull()
        expect(transform?.method).toBe("fiducial")
        expect(transform?.fiducialsFound).toBe(4)
        expect(transform?.residualPt).toBeLessThan(2)
        expect(worst).toBeLessThan(1)
    })

    it("finds a page in a realistic hand-held photo", async () => {
        const { transform, worst } = await roundTripError({
            matchCount: 4,
            scale: NEW_SCALE,
            seed: 11,
            perspective: 0.03,
            rotationDeg: 5,
            blurSigma: 1,
            noiseSigma: 4,
            shading: 0.25
        })
        expect(transform).not.toBeNull()
        expect(transform?.residualPt).toBeLessThan(3)
        expect(worst).toBeLessThan(2)
    })

    it("locates the printed registration marks themselves", async () => {
        const sheet = await synthesizeSheet({
            matchCount: 2,
            eventType: "regular_season",
            scale: NEW_SCALE
        })
        const { image } = distort(sheet.image, {
            seed: 5,
            perspective: 0.025,
            rotationDeg: -3
        })
        const transform = locatePage(image)
        if (!transform) throw new Error("not located")

        // Each marker's centre should map into the photo onto actual ink
        for (const f of buildFiducials()) {
            const centre = { x: f.x + f.w / 2, y: f.y + f.h / 2 }
            const p = applyH(transform.toImage, centre)
            const x = Math.round(p.x)
            const y = Math.round(p.y)
            expect(image.gray[y * image.width + x]).toBeLessThan(100)
        }
    })

    it("holds up across seeds, match counts and distortions", async () => {
        const failures: string[] = []
        for (const matchCount of [1, 2, 3, 4] as const) {
            for (let seed = 0; seed < 6; seed++) {
                const { transform, worst } = await roundTripError({
                    matchCount,
                    scale: SWEEP_SCALE,
                    seed: seed * 13 + matchCount,
                    perspective: 0.01 + seed * 0.006,
                    rotationDeg: (seed - 3) * 3,
                    blurSigma: seed % 3 === 0 ? 1 : 0,
                    noiseSigma: 3,
                    shading: 0.2
                })
                if (!transform || worst > 2.5) {
                    failures.push(
                        `matches=${matchCount} seed=${seed} worst=${worst.toFixed(2)}`
                    )
                }
            }
        }
        expect(failures).toEqual([])
    }, 120_000)

    it("still works at the old upload resolution, which is why it moved", async () => {
        // Not a requirement, just a record: locating survives 1280px even
        // though reading the digits there does not.
        const { transform } = await roundTripError({
            matchCount: 3,
            scale: OLD_SCALE,
            seed: 2,
            perspective: 0.02,
            rotationDeg: 3
        })
        expect(transform).not.toBeNull()
    })

    it("gives up rather than guessing when the page is absent", () => {
        const blank = {
            width: 400,
            height: 500,
            gray: new Uint8Array(400 * 500).fill(255)
        }
        expect(locatePage(blank)).toBeNull()
    })
})
