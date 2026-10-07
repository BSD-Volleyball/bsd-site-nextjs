import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import worker from "../src/index"

const SELF = {
    fetch: (url: string, init?: RequestInit) =>
        worker.fetch(
            new Request(url, init),
            env as unknown as { PICS: R2Bucket }
        )
}

const HOST = "https://pics.bumpsetdrink.com"

describe("private prefixes", () => {
    it.each([
        "/email-attachments/abc/0-invoice.pdf",
        "/inbound-spool/11111111-2222-4333-8444-555555555555.json",
        "/scoresheet-samples/1/2/crop.png"
    ])("never serves %s, even when the object exists", async (path) => {
        await env.PICS.put(path.slice(1), "secret bytes")
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
