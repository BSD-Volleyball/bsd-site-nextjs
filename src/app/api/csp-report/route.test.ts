import { describe, expect, it, vi } from "vitest"

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { warn } }))

import { POST } from "./route"

function post(body: string, headers: Record<string, string> = {}) {
    return POST(
        new Request("https://league.example/api/csp-report", {
            method: "POST",
            headers: { "content-type": "application/csp-report", ...headers },
            body
        })
    )
}

describe("POST /api/csp-report", () => {
    it("logs the known fields of a report-uri report", async () => {
        const res = await post(
            JSON.stringify({
                "csp-report": {
                    "document-uri": "https://league.example/dashboard",
                    "effective-directive": "script-src-elem",
                    "blocked-uri": "https://evil.example/x.js",
                    "original-policy": "default-src 'self'"
                }
            })
        )
        expect(res.status).toBe(204)
        expect(warn).toHaveBeenLastCalledWith("[csp] Violation reported", {
            directive: "script-src-elem",
            blocked: "https://evil.example/x.js",
            page: "https://league.example/dashboard",
            source: undefined,
            disposition: undefined
        })
    })

    it("accepts Reporting API batches", async () => {
        warn.mockClear()
        const res = await post(
            JSON.stringify([
                {
                    type: "csp-violation",
                    body: { effectiveDirective: "img-src", blockedURL: "data" }
                },
                {
                    type: "csp-violation",
                    body: { effectiveDirective: "connect-src" }
                }
            ])
        )
        expect(res.status).toBe(204)
        expect(warn).toHaveBeenCalledTimes(2)
    })

    it("rejects oversized and malformed bodies", async () => {
        expect((await post("x".repeat(20_000))).status).toBe(413)
        expect((await post("{not json")).status).toBe(400)
    })
})
