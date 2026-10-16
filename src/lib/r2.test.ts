import { beforeEach, describe, expect, it, vi } from "vitest"

// The presigner runs offline: a URL is a signature over the request, so the
// headers it binds can be read back from X-Amz-SignedHeaders.
describe("createPlayerPictureUploadPresignedUrl", () => {
    beforeEach(() => {
        vi.stubEnv("R2_ACCOUNT_ID", "acct")
        vi.stubEnv("R2_ACCESS_KEY_ID", "key")
        vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret")
        vi.stubEnv("R2_BUCKET", "bsd")
    })

    it("signs the content type and length so the uploader cannot change them", async () => {
        const { createPlayerPictureUploadPresignedUrl } = await import("./r2")
        const url = new URL(
            await createPlayerPictureUploadPresignedUrl({
                key: "pictures/1.jpg",
                contentType: "image/jpeg",
                contentLength: 1234
            })
        )
        const signed = (url.searchParams.get("X-Amz-SignedHeaders") ?? "")
            .split(";")
            .sort()
        expect(signed).toContain("content-type")
        expect(signed).toContain("content-length")
        expect(signed).toContain("host")
    })
})
