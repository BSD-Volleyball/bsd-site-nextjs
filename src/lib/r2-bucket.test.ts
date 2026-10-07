import { describe, expect, it } from "vitest"
import { resolveR2Bucket } from "./r2-bucket"

describe("resolveR2Bucket", () => {
    const env = { R2_BUCKET: "bsd", R2_PRIVATE_BUCKET: "bsd-private" }

    it("returns the public bucket for public objects", () => {
        expect(resolveR2Bucket("public", env)).toBe("bsd")
    })

    it("returns the private bucket for private objects", () => {
        expect(resolveR2Bucket("private", env)).toBe("bsd-private")
    })

    it("falls back to the public bucket outside production so dev and CI need no extra var", () => {
        expect(
            resolveR2Bucket("private", { R2_BUCKET: "bsd", NODE_ENV: "test" })
        ).toBe("bsd")
    })

    it("throws in production when the private bucket is unset", () => {
        // Falling back would put email attachments on the public domain.
        expect(() =>
            resolveR2Bucket("private", {
                R2_BUCKET: "bsd",
                NODE_ENV: "production"
            })
        ).toThrow("R2_PRIVATE_BUCKET")
    })

    it("throws when the public bucket is unset", () => {
        expect(() => resolveR2Bucket("public", {})).toThrow("R2_BUCKET")
    })
})
