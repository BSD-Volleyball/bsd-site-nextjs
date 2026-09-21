/**
 * checkbox.ts — decide whether a printed box was ticked, without a model.
 *
 * A checkbox is the easiest thing on the sheet to read: the question is only
 * whether there is ink inside it. Two details make it reliable. The measured
 * region is inset well past the printed border, so the border itself never
 * counts as a mark. And the paper's brightness is taken from just outside the
 * box rather than assumed, which cancels out both the camera's exposure and
 * any local shadow falling across that part of the page.
 *
 * Borderline readings are reported as ambiguous rather than forced to a
 * verdict. A tick the reader is unsure about should reach a human.
 */

import type { BoxRect } from "../layout"
import type { Matrix3 } from "./homography"
import { meanOverRect, type RasterImage } from "./image"

export type CheckState = "unmarked" | "marked" | "ambiguous"

export interface CheckReading {
    /** 0 is pristine paper, 1 is saturated ink, relative to nearby paper. */
    inkRatio: number
    state: CheckState
    /** 0..1; how far the reading sits from the undecided band. */
    confidence: number
}

/** Fraction of the box ignored on each side, to clear the printed border. */
const INSET = 0.25
/** Below this the box is empty; above the upper bound it is definitely marked. */
const LOWER = 0.1
const UPPER = 0.28

export function readCheckbox(
    img: RasterImage,
    toImage: Matrix3,
    box: BoxRect
): CheckReading {
    const inner: BoxRect = {
        x: box.x + box.w * INSET,
        y: box.y + box.h * INSET,
        w: box.w * (1 - INSET * 2),
        h: box.h * (1 - INSET * 2)
    }
    const ink = meanOverRect(img, toImage, inner, 10)
    const paper = paperReference(img, toImage, box)
    if (paper <= 1) return { inkRatio: 0, state: "unmarked", confidence: 0 }

    const inkRatio = Math.max(0, Math.min(1, (paper - ink) / paper))

    let state: CheckState = "ambiguous"
    if (inkRatio < LOWER) state = "unmarked"
    else if (inkRatio > UPPER) state = "marked"

    const distance =
        state === "unmarked"
            ? LOWER - inkRatio
            : state === "marked"
              ? inkRatio - UPPER
              : 0
    const confidence =
        state === "ambiguous" ? 0.25 : Math.min(1, 0.5 + distance * 4)

    return { inkRatio, state, confidence }
}

/**
 * Brightness of the paper immediately around the box. Sampled from four thin
 * strips just outside it and taken at the brightest, so a stray pen stroke
 * crossing one side cannot drag the reference down and fake a tick.
 */
function paperReference(
    img: RasterImage,
    toImage: Matrix3,
    box: BoxRect
): number {
    const gap = Math.max(1.5, box.w * 0.25)
    const thickness = Math.max(1, box.w * 0.3)

    const strips: BoxRect[] = [
        { x: box.x - gap - thickness, y: box.y, w: thickness, h: box.h },
        { x: box.x + box.w + gap, y: box.y, w: thickness, h: box.h },
        { x: box.x, y: box.y - gap - thickness, w: box.w, h: thickness },
        { x: box.x, y: box.y + box.h + gap, w: box.w, h: thickness }
    ]

    return Math.max(...strips.map((s) => meanOverRect(img, toImage, s, 6)))
}
