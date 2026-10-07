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

    // Every way a browser can be made to fetch a remote URL on render. Each
    // one is a tracking pixel if it survives; the control exists for exactly
    // this (see the function's doc comment).
    it.each([
        ["srcset-only img", '<img srcset="https://evil.test/t.png 1x">'],
        [
            "picture source",
            '<picture><source srcset="https://evil.test/t.png"><img alt=""></picture>'
        ],
        ["video poster", '<video poster="https://evil.test/t.png"></video>'],
        [
            "svg image",
            '<svg><image href="https://evil.test/t.png" xlink:href="https://evil.test/t.png"/></svg>'
        ],
        ["input image", '<input type="image" src="https://evil.test/t.png">'],
        [
            "css background-image",
            '<div style="background-image:url(https://evil.test/t.png)">x</div>'
        ],
        [
            "css background shorthand",
            "<div style=\"background:url('https://evil.test/t.png') no-repeat\">x</div>"
        ],
        [
            "css image-set",
            '<div style="background-image:image-set(\\"https://evil.test/t.png\\" 1x)">x</div>'
        ]
    ])("blocks remote fetches via %s", (_label, html) => {
        const result = sanitizeInboundEmailHtml(html, [])
        expect(result.html).not.toContain("evil.test")
        expect(result.blockedImages).toBeGreaterThan(0)
    })

    it("still lets inline attachment images through", () => {
        const { html, blockedImages } = sanitizeInboundEmailHtml(
            '<img src="cid:sig@mail" srcset="cid:sig@mail 1x">',
            attachments
        )
        expect(html).toContain("/api/email-attachments/7?inline=1")
        expect(blockedImages).toBe(0)
    })

    it("lets remote images through when allowed", () => {
        const { html, blockedImages } = sanitizeInboundEmailHtml(
            '<img srcset="https://ok.test/t.png 1x"><div style="background:url(https://ok.test/b.png)">x</div>',
            [],
            { allowRemoteImages: true }
        )
        expect(html).toContain("ok.test/t.png")
        expect(html).toContain("ok.test/b.png")
        expect(blockedImages).toBe(0)
    })

    // CSS resolves backslash escapes inside identifiers, so u\72 l( is url(
    // and posit\69 on is position. Text matching cannot see through that.
    it("drops inline styles that hide a remote url behind CSS escapes", () => {
        const { html, blockedImages } = sanitizeInboundEmailHtml(
            '<div style="background-image:u\\72 l(https://evil.test/a.png)">x</div>',
            []
        )
        expect(html).not.toContain("evil.test")
        expect(blockedImages).toBeGreaterThan(0)
    })

    it("drops inline styles that hide positioning behind CSS escapes", () => {
        const { html } = sanitizeInboundEmailHtml(
            '<div style="posit\\69 on:fixed;inset:0">fake login</div>',
            []
        )
        expect(html).not.toContain("style=")
    })
})
