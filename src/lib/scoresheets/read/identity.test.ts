import { describe, expect, it } from "vitest"

import {
    parseSheetCode,
    parseSheetTag,
    readSheetTagFromPhoto
} from "./identity"
import { decodeJpeg } from "./image"
import { tagPhoto } from "./testing/tag-photo"

describe("parseSheetTag", () => {
    it("reads every part of a tag", () => {
        expect(parseSheetTag("BSD3:F26:W5:2026-10-08:4")).toEqual({
            templateVersion: 3,
            seasonCode: "F26",
            phase: "W",
            ordinal: 5,
            date: "2026-10-08",
            court: 4
        })
    })

    it("knows the sheet of matches with no court", () => {
        expect(parseSheetTag("BSD3:F26:P1:2026-11-05:TBD")?.court).toBeNull()
    })

    it("refuses anything it does not fully understand", () => {
        expect(parseSheetTag("http://bsdvb.us/s")).toBeNull()
        expect(parseSheetTag("BSD3:F26:W5:2026-10-08")).toBeNull()
    })
})

describe("parseSheetCode", () => {
    it("reads the code printed beside the QR", () => {
        expect(parseSheetCode("F26-W4-C3")).toEqual({
            seasonCode: "F26",
            phase: "W",
            ordinal: 4,
            court: 3
        })
    })

    it("forgives the case and spacing a model may return", () => {
        expect(parseSheetCode("f26 - w4 - c3")?.court).toBe(3)
    })

    it("knows the TBD sheet and refuses nonsense", () => {
        expect(parseSheetCode("F26-P2-CTBD")?.court).toBeNull()
        expect(parseSheetCode("COURT 3")).toBeNull()
    })
})

describe("readSheetTagFromPhoto", () => {
    it("decodes the tag from a photo", () => {
        const tag = "BSD3:F26:W5:2026-10-08:2"
        const found = readSheetTagFromPhoto(decodeJpeg(tagPhoto(tag)))
        expect(found?.text).toBe(tag)
        expect(found?.parts.court).toBe(2)
    })

    it("finds nothing on a photo with no tag", () => {
        expect(readSheetTagFromPhoto(decodeJpeg(tagPhoto(null)))).toBeNull()
    })
})
