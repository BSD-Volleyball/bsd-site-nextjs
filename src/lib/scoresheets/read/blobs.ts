/**
 * blobs.ts — connected regions of ink, and which of them look like the
 * registration squares printed at the page's corners.
 *
 * A fiducial is a small, solid, near-square block of ink. That description
 * rejects almost everything else on the sheet: letters are thin, the tally
 * grid is a lattice, the QR's finder patterns are rings rather than solids,
 * and the box borders are hollow.
 */

import type { BinaryImage } from "./binarize"

export interface Blob {
    /** Centre of mass, in pixels. */
    cx: number
    cy: number
    minX: number
    minY: number
    maxX: number
    maxY: number
    area: number
    width: number
    height: number
    /** Inked pixels divided by the bounding box's area; 1 is a solid block. */
    fill: number
}

/** Iterative flood fill; recursion would blow the stack on a large region. */
export function findBlobs(bin: BinaryImage, minArea = 12): Blob[] {
    const { width, height, bits } = bin
    const seen = new Uint8Array(width * height)
    const blobs: Blob[] = []
    const stack: number[] = []

    for (let start = 0; start < bits.length; start++) {
        if (bits[start] === 0 || seen[start] === 1) continue

        stack.length = 0
        stack.push(start)
        seen[start] = 1

        let area = 0
        let sumX = 0
        let sumY = 0
        let minX = width
        let minY = height
        let maxX = 0
        let maxY = 0

        while (stack.length > 0) {
            const idx = stack.pop() as number
            const x = idx % width
            const y = (idx - x) / width

            area++
            sumX += x
            sumY += y
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y

            // Four-connectivity: diagonal links would merge the tally grid
            // into one enormous region.
            if (x > 0) pushIf(idx - 1)
            if (x < width - 1) pushIf(idx + 1)
            if (y > 0) pushIf(idx - width)
            if (y < height - 1) pushIf(idx + width)
        }

        if (area < minArea) continue
        const w = maxX - minX + 1
        const h = maxY - minY + 1
        blobs.push({
            cx: sumX / area,
            cy: sumY / area,
            minX,
            minY,
            maxX,
            maxY,
            area,
            width: w,
            height: h,
            fill: area / (w * h)
        })

        function pushIf(next: number) {
            if (bits[next] === 1 && seen[next] === 0) {
                seen[next] = 1
                stack.push(next)
            }
        }
    }

    return blobs
}

export interface SquareFilter {
    /** Expected side in pixels for a full-size marker. */
    expectedSide: number
    /** Accepted multiples of that side, either way. */
    tolerance?: number
    minFill?: number
}

/**
 * Keep the blobs that could be a registration square, at either the full or
 * the half size. The half-size marker is what makes the page's orientation
 * unambiguous, so it must survive this filter too.
 */
export function squareCandidates(
    blobs: readonly Blob[],
    filter: SquareFilter
): Blob[] {
    const tolerance = filter.tolerance ?? 2.2
    const minFill = filter.minFill ?? 0.72

    return blobs.filter((b) => {
        if (b.fill < minFill) return false

        const aspect = b.width / b.height
        if (aspect < 0.65 || aspect > 1.55) return false

        const side = (b.width + b.height) / 2
        const full = side / filter.expectedSide
        const half = side / (filter.expectedSide / 2)
        const nearFull = full > 1 / tolerance && full < tolerance
        const nearHalf = half > 1 / tolerance && half < tolerance
        return nearFull || nearHalf
    })
}
