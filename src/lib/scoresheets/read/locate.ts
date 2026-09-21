/**
 * locate.ts — work out where the printed page is inside a photograph.
 *
 * Everything else in the reader depends on this one answer. Once a photo has
 * a transform into page space, every rectangle `buildSheetGeometry()` reports
 * can be sampled directly, and reading a sheet stops being image analysis and
 * becomes arithmetic.
 *
 * Fiducials first, QR second. It is tempting to start from the tag QR, since
 * decoding it also identifies the sheet, but the QR is printed with no quiet
 * zone and is the most fragile thing on the page: a thumb over the corner or a
 * highlight across it and the read is dead. The registration squares are
 * large, solid, and four of them are spread to the corners, so they survive
 * far more. The QR is then decoded from the *rectified* page, where it is
 * upright and can be given the white margin the print lacks.
 */

import { buildFiducials, PAGE_HEIGHT, PAGE_WIDTH } from "../layout"
import { binarize } from "./binarize"
import { type Blob, findBlobs, squareCandidates } from "./blobs"
import {
    applyH,
    invertH,
    type Matrix3,
    type Point,
    rectCorners,
    solveHomography
} from "./homography"
import { downscale, type RasterImage } from "./image"

export type LocateMethod = "fiducial" | "qr" | "fiducial+qr"

export interface PageTransform {
    /** Page points to photo pixels; what sampling uses. */
    toImage: Matrix3
    /** Photo pixels back to page points. */
    toPage: Matrix3
    method: LocateMethod
    fiducialsFound: number
    /** RMS reprojection error, in page points. Under ~2 is a good fit. */
    residualPt: number
}

/** Detection runs on a downscaled copy; full resolution buys nothing here. */
const DETECT_MAX_DIMENSION = 1400

/** Page-space centres of the four registration squares. */
function fiducialCentres(): Point[] {
    return buildFiducials().map((f) => ({
        x: f.x + f.w / 2,
        y: f.y + f.h / 2
    }))
}

/** Which of the four is the half-size one, by construction the last. */
const SMALL_INDEX = 3

function centroid(points: readonly Point[]): Point {
    const sum = points.reduce(
        (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
        { x: 0, y: 0 }
    )
    return { x: sum.x / points.length, y: sum.y / points.length }
}

/** Order points counter-clockwise around their centroid. */
function cyclicOrder(points: readonly Point[]): number[] {
    const c = centroid(points)
    return points
        .map((p, i) => ({ i, a: Math.atan2(p.y - c.y, p.x - c.x) }))
        .sort((l, r) => l.a - r.a)
        .map((e) => e.i)
}

/**
 * Match four detected squares to the four printed ones.
 *
 * The half-size marker anchors the correspondence: whichever blob is clearly
 * the smallest must be the bottom-right one. That leaves only the direction of
 * travel around the page in doubt, which is two possibilities, and the better
 * of the two is simply the one that reprojects with less error.
 */
function matchFiducials(
    blobs: readonly Blob[],
    scale: number
): { toImage: Matrix3; residualPt: number } | null {
    if (blobs.length < 4) return null

    const sides = blobs.map((b) => (b.width + b.height) / 2)
    const smallest = sides.indexOf(Math.min(...sides))
    const others = sides.filter((_, i) => i !== smallest)
    const medianOther = others.sort((a, b) => a - b)[
        Math.floor(others.length / 2)
    ]
    // The half-size marker should be visibly smaller; if nothing is, the
    // orientation is undetermined and the QR path is the honest fallback.
    if (sides[smallest] > medianOther * 0.8) return null

    const points: Point[] = blobs.map((b) => ({ x: b.cx, y: b.cy }))
    const order = cyclicOrder(points)
    const smallPos = order.indexOf(smallest)
    if (smallPos < 0) return null

    const expected = fiducialCentres()
    const expectedOrder = cyclicOrder(expected)
    const expectedSmallPos = expectedOrder.indexOf(SMALL_INDEX)

    let best: { toImage: Matrix3; residualPt: number } | null = null

    for (const direction of [1, -1]) {
        const src: Point[] = []
        const dst: Point[] = []
        for (let k = 0; k < 4; k++) {
            const detected = order[(smallPos + direction * k + 8) % 4]
            const printed = expectedOrder[(expectedSmallPos + k) % 4]
            src.push(expected[printed])
            dst.push({
                x: points[detected].x / scale,
                y: points[detected].y / scale
            })
        }

        const h = solveHomography(src, dst)
        if (!h) continue
        const toPage = invertH(h)
        if (!toPage) continue

        // Residual measured in page points, by mapping the observed corners
        // back and comparing against where they were printed.
        const back = dst.map((p) => applyH(toPage, p))
        const residualPt = Math.sqrt(
            back.reduce(
                (acc, p, i) =>
                    acc + (p.x - src[i].x) ** 2 + (p.y - src[i].y) ** 2,
                0
            ) / back.length
        )

        if (!best || residualPt < best.residualPt) {
            best = { toImage: h, residualPt }
        }
    }

    return best
}

export interface QrDetection {
    text: string
    /** Corners of the symbol in photo pixels, clockwise from top-left. */
    corners: [Point, Point, Point, Point]
}

/**
 * Fall back to the tag QR when the squares cannot be found. The symbol is
 * printed flush with no margin, so its outer corners are exactly the corners
 * of the `tagQr` rectangle in page space — four correspondences, which is
 * precisely enough for a homography.
 */
function fromQr(
    detection: QrDetection,
    tagQr: { x: number; y: number; w: number; h: number }
): { toImage: Matrix3; residualPt: number } | null {
    // rectCorners walks bottom-left, top-left, top-right, bottom-right in page
    // space; jsQR reports top-left, top-right, bottom-right, bottom-left.
    const [bl, tl, tr, br] = rectCorners(tagQr)
    const src = [tl, tr, br, bl]
    const dst = detection.corners

    const h = solveHomography(src, dst)
    if (!h) return null
    const toPage = invertH(h)
    if (!toPage) return null

    const back = dst.map((p) => applyH(toPage, p))
    const residualPt = Math.sqrt(
        back.reduce(
            (acc, p, i) => acc + (p.x - src[i].x) ** 2 + (p.y - src[i].y) ** 2,
            0
        ) / back.length
    )
    return { toImage: h, residualPt }
}

export interface LocateOptions {
    /** A QR already decoded from the raw photo, used only as a fallback. */
    qr?: QrDetection | null
    tagQrRect?: { x: number; y: number; w: number; h: number }
}

export function locatePage(
    img: RasterImage,
    opts: LocateOptions = {}
): PageTransform | null {
    const small = downscale(img, DETECT_MAX_DIMENSION)
    const scale = small.width / img.width

    const bin = binarize(small)
    const blobs = findBlobs(bin, 20)

    // A full-size marker is 12pt; convert to pixels in the downscaled copy.
    const expectedSide = 12 * (small.height / PAGE_HEIGHT)
    const candidates = squareCandidates(blobs, { expectedSide })

    const corners = pickCornerCandidates(candidates, small.width, small.height)
    const byFiducial = corners ? matchFiducials(corners, scale) : null

    let chosen = byFiducial
    let method: LocateMethod = "fiducial"
    let fiducialsFound = corners?.length ?? 0

    if (!chosen && opts.qr && opts.tagQrRect) {
        chosen = fromQr(opts.qr, opts.tagQrRect)
        method = "qr"
        fiducialsFound = 0
    }
    if (!chosen) return null

    const toPage = invertH(chosen.toImage)
    if (!toPage) return null

    return {
        toImage: chosen.toImage,
        toPage,
        method,
        fiducialsFound,
        residualPt: chosen.residualPt
    }
}

/**
 * Of all the square-ish blobs, keep the one nearest each corner of the frame.
 * The registration marks are the outermost ink on the page, so proximity to a
 * frame corner is a strong and very cheap discriminator.
 */
function pickCornerCandidates(
    candidates: readonly Blob[],
    width: number,
    height: number
): Blob[] | null {
    if (candidates.length < 4) return null

    const corners: Point[] = [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height }
    ]

    const picked: Blob[] = []
    for (const corner of corners) {
        let best: Blob | null = null
        let bestDistance = Number.POSITIVE_INFINITY
        for (const blob of candidates) {
            if (picked.includes(blob)) continue
            const d = Math.hypot(blob.cx - corner.x, blob.cy - corner.y)
            if (d < bestDistance) {
                bestDistance = d
                best = blob
            }
        }
        if (!best) return null
        picked.push(best)
    }
    return picked
}

/** Where a page-space rect lands in the photo, for cropping. */
export function projectRect(
    transform: PageTransform,
    rect: { x: number; y: number; w: number; h: number }
): Point[] {
    return rectCorners(rect).map((p) => applyH(transform.toImage, p))
}

export const PAGE_SIZE = { width: PAGE_WIDTH, height: PAGE_HEIGHT }
