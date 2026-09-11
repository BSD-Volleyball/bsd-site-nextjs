import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHandler, type SpoolEnvelope } from "../src/index"

const URL_OK = "https://hooks.bumpsetdrink.com/postmark/inbound"
const AUTH = `Basic ${btoa("postmark-hook:hook-secret")}`
const SPOOL_KEY = /^inbound-spool\/[0-9a-f-]{36}\.json$/

const inbound = JSON.stringify({
    MessageID: "msg-1",
    From: "someone@example.test",
    To: "info@bumpsetdrink.com",
    Subject: "Hi",
    Attachments: [
        { Name: "a.png", Content: "aGVsbG8=", ContentType: "image/png" }
    ]
})

function request(init: RequestInit & { url?: string } = {}) {
    const { url = URL_OK, ...rest } = init
    return new Request(url, {
        method: "POST",
        headers: {
            authorization: AUTH,
            "content-type": "application/json",
            "content-length": String(new TextEncoder().encode(inbound).length)
        },
        body: inbound,
        ...rest
    })
}

/** A stand-in for the Vercel app: records the relayed request, answers as told. */
function originStub(answer: Response | Error | "hang") {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetchImpl = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(input), init: init ?? {} })
            if (answer instanceof Error) throw answer
            if (answer === "hang") {
                return new Promise<Response>((_, reject) => {
                    init?.signal?.addEventListener("abort", () =>
                        reject(init.signal?.reason)
                    )
                })
            }
            return answer.clone()
        }
    )
    return { calls, fetch: fetchImpl as unknown as typeof fetch }
}

async function spooledKeys(): Promise<string[]> {
    const listed = await env.SPOOL_BUCKET.list({ prefix: "inbound-spool/" })
    return listed.objects.map((o) => o.key)
}

function run(handler: ReturnType<typeof createHandler>, req: Request) {
    return handler.fetch(req, env)
}

beforeEach(async () => {
    for (const key of await spooledKeys()) await env.SPOOL_BUCKET.delete(key)
})

describe("postmark inbound worker", () => {
    it("spools the body to R2 verbatim and relays an envelope", async () => {
        const origin = originStub(Response.json({ received: true }))
        const res = await run(createHandler(origin), request())

        expect(res.status).toBe(200)
        const keys = await spooledKeys()
        expect(keys).toHaveLength(1)
        expect(keys[0]).toMatch(SPOOL_KEY)
        const object = await env.SPOOL_BUCKET.get(keys[0] as string)
        expect(await object?.text()).toBe(inbound)
        expect(object?.httpMetadata?.contentType).toBe("application/json")

        expect(origin.calls).toHaveLength(1)
        const call = origin.calls[0] as { url: string; init: RequestInit }
        expect(call.url).toBe(
            "https://www.bumpsetdrink.com/api/webhooks/postmark"
        )
        expect(call.init.method).toBe("POST")
        expect(call.init.redirect).toBe("manual")
        const headers = call.init.headers as Record<string, string>
        expect(headers.authorization).toBe(AUTH)
        expect(headers["content-type"]).toBe("application/json")
        const envelope = JSON.parse(String(call.init.body)) as SpoolEnvelope
        expect(envelope).toEqual({
            RecordType: "BSDSpooledInbound",
            SpoolKey: keys[0],
            ContentLength: new TextEncoder().encode(inbound).length
        })
        expect(await res.json()).toEqual({ received: true, spoolKey: keys[0] })
    })

    it("spools a body without Content-Length by buffering it", async () => {
        const origin = originStub(Response.json({ received: true }))
        const req = new Request(URL_OK, {
            method: "POST",
            headers: {
                authorization: AUTH,
                "content-type": "application/json"
            },
            body: new Blob([inbound]).stream()
        })
        const res = await run(createHandler(origin), req)

        expect(res.status).toBe(200)
        const keys = await spooledKeys()
        expect(keys).toHaveLength(1)
        expect(
            await (await env.SPOOL_BUCKET.get(keys[0] as string))?.text()
        ).toBe(inbound)
    })

    it.each([
        ["missing", null],
        ["wrong password", `Basic ${btoa("postmark-hook:nope")}`],
        ["wrong scheme", "Bearer hook-secret"],
        ["not base64", "Basic %%%"]
    ])("rejects %s credentials without touching R2 or the origin", async (_, auth) => {
        const origin = originStub(Response.json({ received: true }))
        const headers: Record<string, string> = {
            "content-type": "application/json"
        }
        if (auth) headers.authorization = auth
        const res = await run(createHandler(origin), request({ headers }))

        expect(res.status).toBe(401)
        expect(await spooledKeys()).toEqual([])
        expect(origin.calls).toHaveLength(0)
    })

    it("only serves POST on the webhook path", async () => {
        const origin = originStub(Response.json({ received: true }))
        const handler = createHandler(origin)
        expect(
            (await run(handler, request({ method: "GET", body: null }))).status
        ).toBe(405)
        expect(
            (
                await run(
                    handler,
                    request({ url: "https://hooks.bumpsetdrink.com/" })
                )
            ).status
        ).toBe(404)
        expect(origin.calls).toHaveLength(0)
    })

    it("refuses a declared body over the cap before spooling", async () => {
        const origin = originStub(Response.json({ received: true }))
        const res = await run(
            createHandler(origin),
            request({
                headers: {
                    authorization: AUTH,
                    "content-type": "application/json",
                    "content-length": String(91 * 1024 * 1024)
                }
            })
        )
        expect(res.status).toBe(413)
        expect(await spooledKeys()).toEqual([])
        expect(origin.calls).toHaveLength(0)
    })

    it.each([
        400, 404, 500
    ])("passes an origin %s through with its own body and keeps the spool", async (status) => {
        const origin = originStub(
            new Response("<html>Vercel says no</html>", { status })
        )
        const res = await run(createHandler(origin), request())

        expect(res.status).toBe(status)
        const text = await res.text()
        expect(text).not.toContain("Vercel says no")
        const body = JSON.parse(text) as { error: string; spoolKey: string }
        expect(body.error).toBe("Origin rejected the message")
        expect(body.spoolKey).toMatch(SPOOL_KEY)
        expect(await spooledKeys()).toEqual([body.spoolKey])
    })

    it("reports a WAF challenge as 502", async () => {
        const origin = originStub(
            new Response("Security Checkpoint", {
                status: 429,
                headers: { "x-vercel-mitigated": "challenge" }
            })
        )
        const res = await run(createHandler(origin), request())
        expect(res.status).toBe(502)
        expect(((await res.json()) as { error: string }).error).toBe(
            "Origin blocked the relay"
        )
    })

    it("relays an origin 401 as 401", async () => {
        const origin = originStub(
            Response.json({ error: "Unauthorized" }, { status: 401 })
        )
        const res = await run(createHandler(origin), request())
        expect(res.status).toBe(401)
    })

    it("never follows an origin redirect", async () => {
        const origin = originStub(
            new Response(null, {
                status: 307,
                headers: {
                    location: "https://bumpsetdrink.com/api/webhooks/postmark"
                }
            })
        )
        const res = await run(createHandler(origin), request())
        expect(res.status).toBe(502)
        expect(origin.calls).toHaveLength(1)
    })

    it("answers 502 when the origin is unreachable, keeping the spool", async () => {
        const origin = originStub(new TypeError("fetch failed"))
        const res = await run(createHandler(origin), request())
        expect(res.status).toBe(502)
        expect(await spooledKeys()).toHaveLength(1)
    })

    it("answers 504 when the origin exceeds the timeout, keeping the spool", async () => {
        const origin = originStub("hang")
        const res = await run(
            createHandler({ ...origin, originTimeoutMs: 50 }),
            request()
        )
        expect(res.status).toBe(504)
        expect(((await res.json()) as { error: string }).error).toBe(
            "Origin timed out"
        )
        expect(await spooledKeys()).toHaveLength(1)
    })
})
