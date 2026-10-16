/**
 * image.ts — a photo as a single grayscale plane, for decoding the QR tag.
 *
 * The readers are sent the original JPEG bytes; only the QR decoder needs
 * pixels. Keeping one `Uint8Array` rather than RGBA quarters the memory a
 * 7-megapixel photo costs.
 */

import { decode as decodeJpegBuffer } from "jpeg-js"

export interface RasterImage {
    width: number
    height: number
    /** One byte per pixel, row-major, 0 = black. */
    gray: Uint8Array
}

/** Rec. 601 luma, the same weighting the QR decoder assumes. */
function grayFromRgba(
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
    // A 10 MB upload can encode far more pixels than a phone photo holds;
    // decoding is RGBA, so the caps keep one hostile file from taking the
    // function's whole memory. 30 MP is well above any phone camera.
    const decoded = decodeJpegBuffer(bytes, {
        useTArray: true,
        maxResolutionInMP: 30,
        maxMemoryUsageInMB: 256
    })
    return grayFromRgba(decoded.data, decoded.width, decoded.height)
}
