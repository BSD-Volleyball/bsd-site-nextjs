/**
 * binarize.ts — separate ink from paper under uneven light.
 *
 * A single global threshold fails on a phone photo of a gym floor: one corner
 * of the page is often a third darker than the other, so any cutoff that keeps
 * the bright side's ink swallows the dark side's paper. Comparing each pixel
 * against the local mean instead makes the decision immune to that gradient,
 * and an integral image makes the local mean cost four lookups regardless of
 * the window's size.
 */

import {
    type Integral,
    integralImage,
    type RasterImage,
    windowMean
} from "./image"

export interface BinaryImage {
    width: number
    height: number
    /** 1 = ink, 0 = paper. */
    bits: Uint8Array
}

export interface BinarizeOptions {
    /** Window side as a fraction of the shorter dimension. */
    windowFraction?: number
    /** How far below the local mean a pixel must fall to count as ink. */
    bias?: number
}

export function binarize(
    img: RasterImage,
    opts: BinarizeOptions = {}
): BinaryImage {
    const windowFraction = opts.windowFraction ?? 1 / 16
    const bias = opts.bias ?? 12

    const integral: Integral = integralImage(img)
    const radius = Math.max(
        4,
        Math.round((Math.min(img.width, img.height) * windowFraction) / 2)
    )

    const bits = new Uint8Array(img.width * img.height)
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const mean = windowMean(
                integral,
                x - radius,
                y - radius,
                x + radius,
                y + radius
            )
            const value = img.gray[y * img.width + x]
            bits[y * img.width + x] = value < mean - bias ? 1 : 0
        }
    }
    return { width: img.width, height: img.height, bits }
}
