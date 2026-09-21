import { describe, expect, it } from "vitest"

import { SCORE_SHEET_COMPRESSION } from "./capture"
import { PAGE_HEIGHT } from "./layout"

/**
 * These are not style preferences: below roughly 3px per QR module the tag
 * stops decoding, and a digit box under about 30px stops being readable once
 * a hand-held photo's perspective has shrunk its far edge. Pin the arithmetic
 * so nobody lowers the ceiling back to the player-picture default.
 */
describe("SCORE_SHEET_COMPRESSION", () => {
    const pxPerPoint = SCORE_SHEET_COMPRESSION.maxDimension / PAGE_HEIGHT

    /** Worst-case foreshortening on the far edge of an angled photo. */
    const FORESHORTEN = 0.6

    it("keeps a FINAL digit box readable even at an angle", () => {
        const box = 13 * pxPerPoint
        expect(box).toBeGreaterThanOrEqual(45)
        expect(box * FORESHORTEN).toBeGreaterThanOrEqual(28)
    })

    it("keeps a checkbox well clear of its printed border", () => {
        // The border is 0.7-0.9pt; the reader insets 25% before measuring ink
        const check = 7.5 * pxPerPoint
        expect(check).toBeGreaterThanOrEqual(24)
        expect(check * 0.25).toBeGreaterThan(0.9 * pxPerPoint)
    })

    it("keeps the tag QR above the decoder's floor", () => {
        // 24 alphanumeric characters at error correction M is a 25x25 symbol,
        // printed 56pt wide with no quiet zone.
        const modulePx = (56 / 25) * pxPerPoint
        expect(modulePx).toBeGreaterThanOrEqual(6)
        expect(modulePx * FORESHORTEN).toBeGreaterThanOrEqual(4)
    })

    it("stays under the presigned upload cap", () => {
        expect(SCORE_SHEET_COMPRESSION.targetMaxBytes).toBeLessThan(
            10 * 1024 * 1024
        )
    })

    it("never shrinks below a still-readable floor", () => {
        const floor = SCORE_SHEET_COMPRESSION.minDimension / PAGE_HEIGHT
        expect(13 * floor).toBeGreaterThanOrEqual(30)
    })
})
