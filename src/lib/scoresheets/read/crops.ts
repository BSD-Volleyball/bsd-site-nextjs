/**
 * crops.ts — cut the handwritten scores out of a located page.
 *
 * Two jobs, and the order matters. First decide, from ink alone, whether a
 * pair of boxes was written in at all; only then crop the ones that were. That
 * ordering is what stops a transcriber inventing a score for an empty game:
 * it never sees a box we believe is blank.
 *
 * The two digit boxes of a score are cropped together rather than separately.
 * "25" read as one image is a far easier question than "2" and "5" read in
 * isolation, and the pair is the unit the rules constrain anyway.
 */

import type { BoxRect, SheetGeometry } from "../layout"
import type { SheetEventType } from "../types"
import type { Matrix3 } from "./homography"
import { type RasterImage, sampleRect } from "./image"
import { encodeGrayPng } from "./png"
import { gameConstraint, legalValues } from "./rules"

/** Output pixels per page point when cutting a crop. */
const CROP_SCALE = 5
/** Page points of white kept around the boxes, for context. */
const CROP_MARGIN = 2
/**
 * Fraction of the inner area that must be inked to count as written in.
 *
 * Measured, not guessed. Across heavily distorted synthetic sheets an empty
 * pair of boxes reads exactly zero, while the sparsest possible score — a
 * single-digit "1" or "7", with the tens box left blank — reads about 0.037.
 * This sits in that gap with roughly threefold margin either way.
 */
const INK_THRESHOLD = 0.012
/**
 * Ink in the tens box alone, above which the score is certainly two digits
 * and below which it is certainly one. Between them the count is unknown and
 * no conclusion is drawn: a handwritten "1" is the sparsest mark on the page
 * and sits close to this line, so guessing either way would be worse than
 * admitting the box is ambiguous.
 */
const TENS_PRESENT = 0.05
const TENS_ABSENT = 0.008
/** Ignored border of each box, as a fraction, when measuring ink. */
const INK_INSET = 0.24
/** How much darker than paper a pixel must be to count as a pen stroke. */
const INK_CONTRAST = 0.28
/** Output pixels per point when measuring ink coverage. */
const INK_SCALE = 4

export interface ScoreCrop {
    /** Stable identity, and what the transcriber must echo back. */
    id: string
    matchId: number
    team: "home" | "away"
    game: 1 | 2 | 3
    /** Grayscale PNG of both digit boxes together. */
    png: Uint8Array
    width: number
    height: number
    /** Every score this game could legally have ended on. */
    legalValues: number[]
    /** Fraction of the boxes covered in ink; drives the blank decision. */
    inkRatio: number
    /**
     * How many digits were actually written, measured box by box.
     *
     * This is the check that catches a transcriber dropping a tens digit.
     * Reading "18" as "8" produces a score that is perfectly legal and has
     * the same winner, so neither the rules nor the WIN tick notice; only the
     * ink in the tens box does.
     */
    digitsWritten: DigitCount
}

/** `null` when the ink is too ambiguous to commit either way. */
export type DigitCount = 1 | 2 | null

export interface CropResult {
    /** Boxes with ink in them, worth transcribing. */
    written: ScoreCrop[]
    /** Ids of the pairs judged empty; these never reach a model. */
    blank: string[]
}

export function cropId(
    matchId: number,
    team: "home" | "away",
    game: number
): string {
    return `${matchId}:${team}:${game}`
}

/** The two digit boxes plus a little white, as one rectangle. */
function pairRect(boxes: [BoxRect, BoxRect]): BoxRect {
    const [tens, ones] = boxes
    const x = Math.min(tens.x, ones.x) - CROP_MARGIN
    const y = Math.min(tens.y, ones.y) - CROP_MARGIN
    const right = Math.max(tens.x + tens.w, ones.x + ones.w) + CROP_MARGIN
    const top = Math.max(tens.y + tens.h, ones.y + ones.h) + CROP_MARGIN
    return { x, y, w: right - x, h: top - y }
}

/**
 * How much of the inside of the boxes is covered in ink.
 *
 * Coverage rather than average brightness, which matters more than it sounds.
 * A handwritten "25" is two thin strokes: it barely moves the mean of the box
 * it sits in, and the faint halo a printed border leaves after blurring moves
 * it by about as much. Measured as a mean, a written box and an empty one are
 * indistinguishable. Counting how many pixels are *clearly* darker than the
 * paper separates them cleanly, because a border halo is a gradient and pen
 * strokes are not.
 */
function boxInk(img: RasterImage, toImage: Matrix3, box: BoxRect): number {
    return inkCoverage(img, toImage, [box, box])
}

function inkCoverage(
    img: RasterImage,
    toImage: Matrix3,
    boxes: [BoxRect, BoxRect]
): number {
    let best = 0

    for (const box of boxes) {
        const inner: BoxRect = {
            x: box.x + box.w * INK_INSET,
            y: box.y + box.h * INK_INSET,
            w: box.w * (1 - INK_INSET * 2),
            h: box.h * (1 - INK_INSET * 2)
        }
        const sample = sampleRect(img, toImage, inner, INK_SCALE)
        if (sample.gray.length === 0) continue

        // The paper's own brightness, taken high enough up the distribution
        // that the strokes themselves cannot drag it down.
        const sorted = Float64Array.from(sample.gray).sort()
        const paper = sorted[Math.floor(sorted.length * 0.85)]
        if (paper <= 1) continue

        const cutoff = paper * (1 - INK_CONTRAST)
        let dark = 0
        for (const value of sample.gray) if (value < cutoff) dark++
        best = Math.max(best, dark / sample.gray.length)
    }

    return best
}

export function cropScoreBoxes(
    img: RasterImage,
    toImage: Matrix3,
    geometry: SheetGeometry,
    eventType: SheetEventType
): CropResult {
    const written: ScoreCrop[] = []
    const blank: string[] = []

    for (const game of geometry.games) {
        const id = cropId(game.matchId, game.team, game.game)
        const inkRatio = inkCoverage(img, toImage, game.finalDigits)

        if (inkRatio < INK_THRESHOLD) {
            blank.push(id)
            continue
        }

        const rect = pairRect(game.finalDigits)
        const sample = sampleRect(img, toImage, rect, CROP_SCALE)
        const tensInk = boxInk(img, toImage, game.finalDigits[0])
        written.push({
            id,
            matchId: game.matchId,
            team: game.team,
            game: game.game,
            png: encodeGrayPng(sample),
            width: sample.width,
            height: sample.height,
            legalValues: legalValues(gameConstraint(eventType, game.game)),
            inkRatio,
            digitsWritten:
                tensInk >= TENS_PRESENT ? 2 : tensInk <= TENS_ABSENT ? 1 : null
        })
    }

    return { written, blank }
}
