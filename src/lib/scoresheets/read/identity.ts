/**
 * identity.ts — work out which sheet a photo is.
 *
 * The small QR in the bottom-right corner carries the sheet's tag, and the
 * code printed above it says the same thing in letters. The QR is decoded
 * here, for free and with no model; it decoded from 6 of 6 photos taken flat
 * on a table (2026-10-08) but only 3 of 6 taken folded on a lap (2026-10-01),
 * so the pipeline falls back to asking a reader for the printed code.
 */

import jsQR from "jsqr"

import { grayToRgba, type RasterImage } from "./image"

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

export interface IdentityResult {
    text: string
    parts: SheetTagParts
}

/** Decode the tag straight from the photo. */
export function readSheetTagFromPhoto(img: RasterImage): IdentityResult | null {
    const result = jsQR(grayToRgba(img), img.width, img.height, {
        inversionAttempts: "dontInvert"
    })
    if (!result) return null
    const parts = parseSheetTag(result.data)
    if (!parts) return null
    return { text: result.data, parts }
}

export interface SheetCodeParts {
    seasonCode: string
    phase: "W" | "P"
    ordinal: number
    /** Null for the trailing sheet of matches with no court ("CTBD"). */
    court: number | null
}

const CODE_PATTERN = /^([A-Z]\d{2})-([WP])(\d+)-C(\d+|TBD)$/

/** The printed code beside the QR, as `sheetCode()` writes it: "F26-W4-C3". */
export function parseSheetCode(code: string): SheetCodeParts | null {
    const match = CODE_PATTERN.exec(code.toUpperCase().replace(/\s+/g, ""))
    if (!match) return null
    const [, seasonCode, phase, ordinal, court] = match
    return {
        seasonCode,
        phase: phase as "W" | "P",
        ordinal: Number.parseInt(ordinal, 10),
        court: court === "TBD" ? null : Number.parseInt(court, 10)
    }
}
