import { describe, expect, it } from "vitest"
import {
    formatFileSize,
    rewriteCidImages,
    sanitizeInboundEmailHtml
} from "./email-attachments-client"

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

describe("sanitizeInboundEmailHtml", () => {
    const attachments = [{ id: 7, content_id: "<sig@mail>" }]

    it("strips scripts and event handlers", () => {
        const { html } = sanitizeInboundEmailHtml(
            '<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>',
            []
        )
        expect(html).not.toMatch(/script|onclick|javascript:/i)
        expect(html).toContain("Hi")
    })

    it("keeps cosmetic styles but drops positioning", () => {
        const { html } = sanitizeInboundEmailHtml(
            '<p style="color:red">ok</p><div style="position:fixed;inset:0">fake login</div>',
            []
        )
        expect(html).toContain('style="color:red"')
        expect(html).not.toMatch(/position/i)
    })

    it("holds back remote images but keeps inline cid images", () => {
        const { html, blockedImages } = sanitizeInboundEmailHtml(
            '<img src="https://tracker.example/p.gif"><img src="cid:sig@mail">',
            attachments
        )
        expect(blockedImages).toBe(1)
        expect(html).not.toContain("tracker.example")
        expect(html).toContain("/api/email-attachments/7?inline=1")
    })

    it("loads remote images when allowed", () => {
        const { html, blockedImages } = sanitizeInboundEmailHtml(
            '<img src="https://example.test/photo.png">',
            [],
            { allowRemoteImages: true }
        )
        expect(blockedImages).toBe(0)
        expect(html).toContain("https://example.test/photo.png")
    })

    it("does not leak its hooks into later sanitize calls", () => {
        sanitizeInboundEmailHtml('<img src="https://a.test/x.png">', [])
        const { html } = sanitizeInboundEmailHtml(
            '<img src="https://a.test/x.png">',
            [],
            { allowRemoteImages: true }
        )
        expect(html).toContain("https://a.test/x.png")
    })
})
