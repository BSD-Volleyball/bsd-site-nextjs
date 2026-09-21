/**
 * image.ts — a single grayscale plane and the sampling primitives over it.
 *
 * Everything downstream works in grayscale: fiducials are black on white, the
 * QR is black on white, ink density is a brightness question. Keeping one
 * `Uint8Array` rather than RGBA quarters the memory a 7-megapixel photo costs
 * and makes every loop simpler.
 */

import { decode as decodeJpegBuffer } from "jpeg-js"

import { applyH, type Matrix3, type Point } from "./homography"

export interface RasterImage {
    width: number
    height: number
    /** One byte per pixel, row-major, 0 = black. */
    gray: Uint8Array
}

/** Rec. 601 luma, the same weighting the QR decoder assumes. */
export function grayFromRgba(
    rgba: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number
): RasterImage {
    const gray = new Uint8Array(width * height)
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
        gray[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000
    }
    return { width, height, gray }
}

export function grayToRgba(img: RasterImage): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(img.width * img.height * 4)
    for (let i = 0, p = 0; i < img.gray.length; i++, p += 4) {
        const v = img.gray[i]
        rgba[p] = v
        rgba[p + 1] = v
        rgba[p + 2] = v
        rgba[p + 3] = 255
    }
    return rgba
}

/**
 * Uploads are always JPEG: the browser re-encodes every photo through
 * `canvas.toBlob(..., "image/jpeg")` before it is sent. Anything else is a
 * caller error rather than a case to handle.
 */
export function decodeJpeg(bytes: Uint8Array): RasterImage {
    const decoded = decodeJpegBuffer(bytes, { useTArray: true })
    return grayFromRgba(decoded.data, decoded.width, decoded.height)
}

export function pixelAt(img: RasterImage, x: number, y: number): number {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 255
    return img.gray[y * img.width + x]
}

/**
 * Bilinear sample at fractional coordinates. Resampling a photo into page
 * space lands between pixels almost everywhere, and nearest-neighbour there
 * would add its own noise to an ink measurement.
 */
export function sampleBilinear(img: RasterImage, x: number, y: number): number {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0

    const p00 = pixelAt(img, x0, y0)
    const p10 = pixelAt(img, x0 + 1, y0)
    const p01 = pixelAt(img, x0, y0 + 1)
    const p11 = pixelAt(img, x0 + 1, y0 + 1)

    const top = p00 + (p10 - p00) * fx
    const bottom = p01 + (p11 - p01) * fx
    return top + (bottom - top) * fy
}

/**
 * Render a page-space rectangle into its own upright image.
 *
 * `toImage` maps page points to photo pixels, so walking the output grid and
 * sampling through it un-warps the region in one pass. `scale` is output
 * pixels per page point.
 */
export function sampleRect(
    img: RasterImage,
    toImage: Matrix3,
    rect: { x: number; y: number; w: number; h: number },
    scale: number
): RasterImage {
    const width = Math.max(1, Math.round(rect.w * scale))
    const height = Math.max(1, Math.round(rect.h * scale))
    const gray = new Uint8Array(width * height)

    for (let row = 0; row < height; row++) {
        // Page space has y increasing upward; image rows increase downward.
        const pageY = rect.y + rect.h - (row + 0.5) / scale
        for (let col = 0; col < width; col++) {
            const pageX = rect.x + (col + 0.5) / scale
            const p = applyH(toImage, { x: pageX, y: pageY })
            gray[row * width + col] = Number.isFinite(p.x)
                ? sampleBilinear(img, p.x, p.y)
                : 255
        }
    }
    return { width, height, gray }
}

/** Box-filter downscale, for running detection on a cheaper copy. */
export function downscale(img: RasterImage, maxDimension: number): RasterImage {
    const longest = Math.max(img.width, img.height)
    if (longest <= maxDimension) return img

    const factor = longest / maxDimension
    const width = Math.max(1, Math.round(img.width / factor))
    const height = Math.max(1, Math.round(img.height / factor))
    const gray = new Uint8Array(width * height)

    for (let y = 0; y < height; y++) {
        const y0 = Math.floor((y * img.height) / height)
        const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / height))
        for (let x = 0; x < width; x++) {
            const x0 = Math.floor((x * img.width) / width)
            const x1 = Math.max(
                x0 + 1,
                Math.floor(((x + 1) * img.width) / width)
            )
            let sum = 0
            let n = 0
            for (let sy = y0; sy < y1; sy++) {
                for (let sx = x0; sx < x1; sx++) {
                    sum += img.gray[sy * img.width + sx]
                    n++
                }
            }
            gray[y * width + x] = sum / n
        }
    }
    return { width, height, gray }
}

/**
 * Summed-area table. `sum(x0,y0,x1,y1)` then costs four lookups regardless of
 * the window's size, which is what makes a per-pixel adaptive threshold over
 * a large window affordable.
 */
export interface Integral {
    width: number
    height: number
    data: Float64Array
}

export function integralImage(img: RasterImage): Integral {
    const w = img.width + 1
    const h = img.height + 1
    const data = new Float64Array(w * h)
    for (let y = 0; y < img.height; y++) {
        let rowSum = 0
        for (let x = 0; x < img.width; x++) {
            rowSum += img.gray[y * img.width + x]
            data[(y + 1) * w + (x + 1)] = data[y * w + (x + 1)] + rowSum
        }
    }
    return { width: w, height: h, data }
}

/** Mean brightness of an inclusive pixel window, clamped to the image. */
export function windowMean(
    integral: Integral,
    x0: number,
    y0: number,
    x1: number,
    y1: number
): number {
    const ax = Math.max(0, Math.min(integral.width - 1, x0))
    const ay = Math.max(0, Math.min(integral.height - 1, y0))
    const bx = Math.max(0, Math.min(integral.width - 1, x1 + 1))
    const by = Math.max(0, Math.min(integral.height - 1, y1 + 1))
    const area = (bx - ax) * (by - ay)
    if (area <= 0) return 255

    const w = integral.width
    const total =
        integral.data[by * w + bx] -
        integral.data[ay * w + bx] -
        integral.data[by * w + ax] +
        integral.data[ay * w + ax]
    return total / area
}

/** Mean grey over the pixels a page-space rect covers, via the transform. */
export function meanOverRect(
    img: RasterImage,
    toImage: Matrix3,
    rect: { x: number; y: number; w: number; h: number },
    samples = 12
): number {
    let total = 0
    let n = 0
    for (let i = 0; i < samples; i++) {
        const fy = (i + 0.5) / samples
        for (let j = 0; j < samples; j++) {
            const fx = (j + 0.5) / samples
            const p: Point = {
                x: rect.x + rect.w * fx,
                y: rect.y + rect.h * fy
            }
            const q = applyH(toImage, p)
            if (!Number.isFinite(q.x)) continue
            total += sampleBilinear(img, q.x, q.y)
            n++
        }
    }
    return n === 0 ? 255 : total / n
}
