/**
 * identity.ts — work out which sheet a photo is.
 *
 * The tag QR is decoded from the *rectified* page rather than the raw photo.
 * Two things make that much more likely to succeed: the symbol is upright and
 * at a known scale, and we can surround it with the white quiet zone the print
 * does not have. The sheet is rendered with `margin: 0`, so on paper the
 * symbol runs flush to its own edge, which is exactly the condition decoders
 * struggle with.
 */

import jsQR from "jsqr"

import { grayToRgba, type RasterImage, sampleRect } from "./image"
import type { PageTransform } from "./locate"

export interface SheetTagParts {
    templateVersion: number
    seasonCode: string
    /** "W" for a regular-season week, "P" for a playoff week. */
    phase: "W" | "P"
    ordinal: number
    date: string
    /** Null for the trailing sheet of matches with no court assigned. */
    court: number | null
}

const TAG_PATTERN =
    /^BSD(\d+):([A-Z]\d{2}):([WP])(\d+):(\d{4}-\d{2}-\d{2}):(\d+|TBD)$/

/** Strict: a tag we cannot fully understand is not a tag we should act on. */
export function parseSheetTag(text: string): SheetTagParts | null {
    const match = TAG_PATTERN.exec(text.trim())
    if (!match) return null

    const [, version, seasonCode, phase, ordinal, date, court] = match
    return {
        templateVersion: Number.parseInt(version, 10),
        seasonCode,
        phase: phase as "W" | "P",
        ordinal: Number.parseInt(ordinal, 10),
        date,
        court: court === "TBD" ? null : Number.parseInt(court, 10)
    }
}

/** Surround a sample with white so the symbol has the margin it needs. */
function padWithQuietZone(img: RasterImage, border: number): RasterImage {
    const width = img.width + border * 2
    const height = img.height + border * 2
    const gray = new Uint8Array(width * height).fill(255)
    for (let y = 0; y < img.height; y++) {
        gray.set(
            img.gray.subarray(y * img.width, (y + 1) * img.width),
            (y + border) * width + border
        )
    }
    return { width, height, gray }
}

function decode(img: RasterImage): string | null {
    const result = jsQR(grayToRgba(img), img.width, img.height, {
        inversionAttempts: "dontInvert"
    })
    return result?.data ?? null
}

export interface IdentityResult {
    text: string
    parts: SheetTagParts
}

/**
 * Read the tag from a located page. Tries a couple of sampling scales before
 * giving up, because the right one depends on how much of the photo the page
 * actually fills.
 */
export function readSheetTag(
    img: RasterImage,
    transform: PageTransform,
    tagQr: { x: number; y: number; w: number; h: number }
): IdentityResult | null {
    for (const scale of [6, 10, 4]) {
        const sample = sampleRect(img, transform.toImage, tagQr, scale)
        // Four modules of white all round, the standard quiet zone.
        const border = Math.round((sample.width / 25) * 4)
        const text = decode(padWithQuietZone(sample, border))
        if (!text) continue

        const parts = parseSheetTag(text)
        if (parts) return { text, parts }
    }
    return null
}

/** Last resort: decode straight from the photo, before the page is located. */
export function readSheetTagFromPhoto(
    img: RasterImage
): (IdentityResult & { corners: ReturnType<typeof cornersOf> }) | null {
    const result = jsQR(grayToRgba(img), img.width, img.height, {
        inversionAttempts: "dontInvert"
    })
    if (!result) return null
    const parts = parseSheetTag(result.data)
    if (!parts) return null
    return { text: result.data, parts, corners: cornersOf(result) }
}

function cornersOf(result: NonNullable<ReturnType<typeof jsQR>>) {
    const l = result.location
    return [
        l.topLeftCorner,
        l.topRightCorner,
        l.bottomRightCorner,
        l.bottomLeftCorner
    ] as [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number }
    ]
}
