import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import worker, { normalizePath } from "../src/index"

const SELF = {
    fetch: (url: string, init?: RequestInit) =>
        worker.fetch(
            new Request(url, init),
            env as unknown as { PICS: R2Bucket }
        )
}

const HOST = "https://pics.bumpsetdrink.com"

describe("normalizePath", () => {
    it("decodes percent-encoded slashes and collapses repeats", () => {
        expect(normalizePath("/inbound-spool%2Fx.json")).toBe(
            "/inbound-spool/x.json"
        )
        expect(normalizePath("/sponsorlogos//1-2.png")).toBe(
            "/sponsorlogos/1-2.png"
        )
    })

    it("refuses malformed encodings and parent segments", () => {
        expect(normalizePath("/playerpics/%E0%A4%A")).toBeNull()
        expect(normalizePath("/playerpics/../inbound-spool/x.json")).toBeNull()
        expect(normalizePath("/playerpics/%2e%2e/x.json")).toBeNull()
    })
})

describe("private prefixes", () => {
    it.each([
        "/email-attachments/abc/0-invoice.pdf",
        "/inbound-spool/11111111-2222-4333-8444-555555555555.json",
        "/scoresheet-samples/1/2/crop.png",
        // Encoded slash: the route-level bypass found in the 2026-10 audit.
        "/email-attachments%2Fabc%2F0-invoice.pdf",
        "/inbound-spool%2F11111111-2222-4333-8444-555555555555.json",
        "/scoresheet-samples%2F1%2F2%2Fcrop.png",
        "//scoresheet-samples/1/2/crop.png"
    ])("never serves %s, even when the object exists", async (path) => {
        const key = decodeURIComponent(path).replace(/^\/+/, "")
        await env.PICS.put(key, "secret bytes")
        const response = await SELF.fetch(`${HOST}${path}`)
        expect(response.status).toBe(404)
        expect(await response.text()).not.toContain("secret")
    })
})

describe("sponsor logos", () => {
    it("serves the logo with a sandboxing CSP", async () => {
        await env.PICS.put(
            "sponsorlogos/7-1700000000000.svg",
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            { httpMetadata: { contentType: "image/svg+xml" } }
        )
        const response = await SELF.fetch(
            `${HOST}/sponsorlogos/7-1700000000000.svg`
        )
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("image/svg+xml")
        expect(response.headers.get("content-security-policy")).toContain(
            "sandbox"
        )
        expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    })

    it("sandboxes the logo even when the slash is percent-encoded", async () => {
        await env.PICS.put(
            "sponsorlogos/8-1700000000000.svg",
            '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
            { httpMetadata: { contentType: "image/svg+xml" } }
        )
        const response = await SELF.fetch(
            `${HOST}/sponsorlogos%2F8-1700000000000.svg`
        )
        expect(response.status).toBe(200)
        expect(response.headers.get("content-security-policy")).toContain(
            "sandbox"
        )
    })

    it("answers 404 for a missing logo and 405 for writes", async () => {
        expect(
            (await SELF.fetch(`${HOST}/sponsorlogos/missing.png`)).status
        ).toBe(404)
        expect(
            (
                await SELF.fetch(`${HOST}/sponsorlogos/x.png`, {
                    method: "PUT",
                    body: "x"
                })
            ).status
        ).toBe(405)
    })
})

describe("public pictures", () => {
    it("serves a player picture with its content type and a short cache", async () => {
        await env.PICS.put("playerpics/123_jl.jpg", "jpeg bytes", {
            httpMetadata: { contentType: "image/jpeg" }
        })
        const response = await SELF.fetch(`${HOST}/playerpics/123_jl.jpg`)
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("image/jpeg")
        expect(await response.text()).toBe("jpeg bytes")
        // Player pictures are overwritten in place on re-upload, so they
        // must not be cached as immutable.
        expect(response.headers.get("cache-control")).toBe(
            "public, max-age=14400"
        )
        expect(response.headers.get("content-security-policy")).toBeNull()
    })

    it("serves a public picture requested with an encoded slash", async () => {
        await env.PICS.put("teampics/5.jpg", "team bytes", {
            httpMetadata: { contentType: "image/jpeg" }
        })
        const response = await SELF.fetch(`${HOST}/teampics%2F5.jpg`)
        expect(response.status).toBe(200)
        expect(await response.text()).toBe("team bytes")
    })

    it("answers 404 for a missing picture, the root, and malformed paths", async () => {
        expect((await SELF.fetch(`${HOST}/playerpics/none.jpg`)).status).toBe(
            404
        )
        expect((await SELF.fetch(`${HOST}/`)).status).toBe(404)
        expect((await SELF.fetch(`${HOST}/playerpics/%E0%A4%A`)).status).toBe(
            404
        )
    })

    it("answers HEAD without a body", async () => {
        await env.PICS.put("playerpics/head.jpg", "bytes", {
            httpMetadata: { contentType: "image/jpeg" }
        })
        const response = await SELF.fetch(`${HOST}/playerpics/head.jpg`, {
            method: "HEAD"
        })
        expect(response.status).toBe(200)
        expect(await response.text()).toBe("")
    })
})
