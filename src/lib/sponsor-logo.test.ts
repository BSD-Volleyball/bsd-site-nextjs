import { describe, expect, it } from "vitest"
import {
    SPONSOR_LOGO_MAX_BYTES,
    buildSponsorLogoFilename,
    getSponsorLogoDbPath,
    getSponsorLogoExtension,
    getSponsorLogoObjectKey,
    isSponsorLogoFilenameFor,
    objectKeyFromLogoPath
} from "./sponsor-logo"

describe("sponsor logo helpers", () => {
    it("maps allowed content types to file extensions", () => {
        expect(getSponsorLogoExtension("image/png")).toBe("png")
        expect(getSponsorLogoExtension("image/jpeg")).toBe("jpg")
        expect(getSponsorLogoExtension("image/svg+xml")).toBe("svg")
        expect(getSponsorLogoExtension("image/webp")).toBe("webp")
    })

    it("rejects content types that are not logo images", () => {
        expect(getSponsorLogoExtension("image/gif")).toBeNull()
        expect(getSponsorLogoExtension("application/pdf")).toBeNull()
        expect(getSponsorLogoExtension("")).toBeNull()
    })

    it("builds a filename scoped to the sponsor with a cache-busting nonce", () => {
        expect(buildSponsorLogoFilename(12, "png", 1700000000000)).toBe(
            "12-1700000000000.png"
        )
    })

    it("derives the object key and DB path from the filename", () => {
        expect(getSponsorLogoObjectKey("12-1.png")).toBe("sponsorlogos/12-1.png")
        expect(getSponsorLogoDbPath("12-1.png")).toBe("/sponsorlogos/12-1.png")
        expect(objectKeyFromLogoPath("/sponsorlogos/12-1.png")).toBe(
            "sponsorlogos/12-1.png"
        )
    })

    it("only accepts finalize filenames that belong to the sponsor", () => {
        expect(isSponsorLogoFilenameFor(12, "12-1700000000000.png")).toBe(true)
        expect(isSponsorLogoFilenameFor(12, "13-1700000000000.png")).toBe(false)
        expect(isSponsorLogoFilenameFor(12, "12-abc.png")).toBe(false)
        expect(isSponsorLogoFilenameFor(12, "12-1.exe")).toBe(false)
        expect(isSponsorLogoFilenameFor(12, "../12-1.png")).toBe(false)
    })

    it("caps logo uploads at 2 MB", () => {
        expect(SPONSOR_LOGO_MAX_BYTES).toBe(2 * 1024 * 1024)
    })
})
