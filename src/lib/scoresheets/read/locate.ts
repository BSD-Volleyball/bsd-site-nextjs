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

import {
    buildFiducials,
    buildSheetGeometry,
    PAGE_HEIGHT,
    PAGE_WIDTH
} from "../layout"
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
import { downscale, meanOverRect, type RasterImage } from "./image"

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

/** Below this the candidate transform is not looking at a score sheet. */
const MIN_CONTENT_SCORE = 0.35

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
 * The obvious scoring rule does not work here. Four correspondences determine
 * a homography exactly, so *every* assignment reprojects with zero error: a
 * page rectified ninety degrees out scores just as well as the right one. The
 * assignment has to be judged on whether the resulting transform actually
 * lands on the page's printing, which is what `scoreTransform` measures.
 *
 * The half-size marker suggests which corner is bottom-right, so the two
 * assignments anchored on it are tried first; the other rotations follow in
 * case it was mis-measured. The winner is whichever one finds the ink.
 */
function matchFiducials(
    img: RasterImage,
    blobs: readonly Blob[],
    scale: number
): { toImage: Matrix3; score: number } | null {
    if (blobs.length < 4) return null

    const sides = blobs.map((b) => (b.width + b.height) / 2)
    const smallest = sides.indexOf(Math.min(...sides))

    const points: Point[] = blobs.map((b) => ({ x: b.cx, y: b.cy }))
    const order = cyclicOrder(points)
    const smallPos = order.indexOf(smallest)
    if (smallPos < 0) return null

    const expected = fiducialCentres()
    const expectedOrder = cyclicOrder(expected)
    const expectedSmallPos = expectedOrder.indexOf(SMALL_INDEX)

    let best: { toImage: Matrix3; score: number } | null = null

    for (const rotation of [0, 1, 2, 3]) {
        for (const direction of [1, -1]) {
            const src: Point[] = []
            const dst: Point[] = []
            for (let k = 0; k < 4; k++) {
                const detected =
                    order[(smallPos + rotation + direction * k + 8) % 4]
                const printed = expectedOrder[(expectedSmallPos + k) % 4]
                src.push(expected[printed])
                dst.push({
                    x: points[detected].x / scale,
                    y: points[detected].y / scale
                })
            }

            const h = solveHomography(src, dst)
            if (!h || !invertH(h)) continue

            const score = scoreTransform(img, h)
            if (!best || score > best.score) best = { toImage: h, score }
        }
    }

    return best
}

/**
 * How much a candidate transform looks like it found the printed page.
 *
 * Two features are on every sheet and sit asymmetrically, which is what pins
 * the orientation down: the ref-notes box, a wide outlined rectangle across
 * the bottom left, and the machine tag beside it, which is dense and busy in a
 * way blank paper never is. A transform rotated or mirrored puts both over
 * empty margin and scores near nothing.
 */
function scoreTransform(img: RasterImage, toImage: Matrix3): number {
    const geometry = buildSheetGeometry(
        { court: null, matches: [] },
        "regular_season"
    )
    const notes = geometry.refNotes
    const edge = 2

    // The notes box is an outline: its edges carry ink, its middle does not.
    const top = meanOverRect(img, toImage, {
        x: notes.x,
        y: notes.y + notes.h - edge,
        w: notes.w,
        h: edge
    })
    const bottom = meanOverRect(img, toImage, {
        x: notes.x,
        y: notes.y,
        w: notes.w,
        h: edge
    })
    const middle = meanOverRect(img, toImage, {
        x: notes.x + notes.w * 0.2,
        y: notes.y + notes.h * 0.35,
        w: notes.w * 0.6,
        h: notes.h * 0.3
    })
    const outlineScore = Math.max(0, middle - Math.min(top, bottom)) / 255

    // A QR is roughly half ink; paper is not.
    const tagInk = 1 - meanOverRect(img, toImage, geometry.tagQr, 16) / 255
    const tagScore = 1 - Math.abs(tagInk - 0.45) / 0.45

    return outlineScore * 2 + Math.max(0, tagScore)
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
    const byFiducial = corners ? matchFiducials(img, corners, scale) : null

    let toImage: Matrix3 | null = byFiducial?.toImage ?? null
    let method: LocateMethod = "fiducial"
    let fiducialsFound = corners?.length ?? 0
    let residualPt = 0

    // A transform that cannot find the ref-notes box or the tag is not a
    // transform; fall back rather than hand back a confident wrong answer.
    if (byFiducial && byFiducial.score < MIN_CONTENT_SCORE) toImage = null

    if (!toImage && opts.qr && opts.tagQrRect) {
        const fromQrFit = fromQr(opts.qr, opts.tagQrRect)
        if (fromQrFit) {
            toImage = fromQrFit.toImage
            residualPt = fromQrFit.residualPt
            method = "qr"
            fiducialsFound = 0
        }
    }
    if (!toImage) return null

    const toPage = invertH(toImage)
    if (!toPage) return null

    return { toImage, toPage, method, fiducialsFound, residualPt }
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
