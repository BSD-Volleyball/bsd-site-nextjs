import { describe, expect, it } from "vitest"
import { formatFileSize, rewriteCidImages } from "./email-attachments-client"

describe("rewriteCidImages", () => {
    const attachments = [
        { id: 7, content_id: "<sig@mail>" },
        { id: 8, content_id: null }
    ]

    it("points cid: image sources at the inline download route", () => {
        const html = '<p>Hi</p><img src="cid:sig@mail" alt="">'
        expect(rewriteCidImages(html, attachments)).toBe(
            '<p>Hi</p><img src="/api/email-attachments/7?inline=1" alt="">'
        )
    })

    it("leaves unknown cids and non-cid sources alone", () => {
        const html = '<img src="cid:other@mail"><img src="https://x/y.png">'
        expect(rewriteCidImages(html, attachments)).toBe(html)
    })

    it("returns the input untouched when no attachment has a content id", () => {
        const html = '<img src="cid:sig@mail">'
        expect(rewriteCidImages(html, [{ id: 1, content_id: null }])).toBe(html)
    })
})

describe("formatFileSize", () => {
    it("picks a sensible unit", () => {
        expect(formatFileSize(512)).toBe("512 B")
        expect(formatFileSize(20 * 1024)).toBe("20 KB")
        expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB")
    })
})
