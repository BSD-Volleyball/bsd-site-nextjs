import { afterEach, describe, expect, it, vi } from "vitest"

import type { ScoreCrop } from "../crops"
import { TranscriberError } from "./port"
import { createVisionTranscriber, transcriberFromEnv } from "./vision"

function crop(id: string, legal = [0, 19, 21, 25, 26, 27]): ScoreCrop {
    const [matchId, team, game] = id.split(":")
    return {
        id,
        matchId: Number(matchId),
        team: team as "home" | "away",
        game: Number(game) as 1 | 2 | 3,
        png: new Uint8Array([137, 80, 78, 71]),
        width: 110,
        height: 65,
        legalValues: legal,
        inkRatio: 0.2,
        digitsWritten: 2
    }
}

const CROPS = [crop("1:home:1"), crop("1:away:1")]

function reply(body: unknown, ok = true, status = 200) {
    return vi.fn(
        async () =>
            new Response(
                typeof body === "string" ? body : JSON.stringify(body),
                { status: ok ? status : status }
            )
    ) as unknown as typeof fetch
}

function completion(content: string) {
    return { choices: [{ message: { content } }] }
}

function make(fetchImpl: typeof fetch) {
    return createVisionTranscriber({
        apiKey: "test-key",
        model: "test-model",
        baseUrl: "https://example.test/v1",
        fetchImpl
    })
}

describe("createVisionTranscriber", () => {
    it("sends one image per box and reads the reply", async () => {
        const fetchImpl = reply(
            completion(
                JSON.stringify({
                    readings: [
                        { id: "1:home:1", value: 25, confidence: 0.9 },
                        { id: "1:away:1", value: 19, confidence: 0.88 }
                    ]
                })
            )
        )
        const readings = await make(fetchImpl).transcribe(CROPS)

        expect(readings.map((r) => r.value)).toEqual([25, 19])

        const call = vi.mocked(fetchImpl).mock.calls[0]
        const body = JSON.parse(String(call[1]?.body))
        expect(body.model).toBe("test-model")
        expect(body.temperature).toBe(0)
        // One text instruction plus one image per crop
        const images = body.messages[0].content.filter(
            (c: { type: string }) => c.type === "image_url"
        )
        expect(images).toHaveLength(2)
        expect(images[0].image_url.url).toMatch(/^data:image\/png;base64,/)
        // The ids it must answer are spelled out
        expect(body.messages[0].content[0].text).toContain("1:home:1")
    })

    it("tolerates a reply wrapped in prose or fences", async () => {
        const readings = await make(
            reply(
                completion(
                    'Here you go:\n```json\n{"readings":[{"id":"1:home:1","value":25,"confidence":0.9},{"id":"1:away:1","value":19,"confidence":0.9}]}\n```'
                )
            )
        ).transcribe(CROPS)
        expect(readings.map((r) => r.value)).toEqual([25, 19])
    })

    it("refuses a reply that answers the wrong boxes", async () => {
        await expect(
            make(
                reply(
                    completion(
                        JSON.stringify({
                            readings: [
                                { id: "1:home:1", value: 25, confidence: 0.9 },
                                { id: "9:away:3", value: 19, confidence: 0.9 }
                            ]
                        })
                    )
                )
            ).transcribe(CROPS)
        ).rejects.toThrow(TranscriberError)
    })

    it("refuses a reply that skips a box", async () => {
        await expect(
            make(
                reply(
                    completion(
                        JSON.stringify({
                            readings: [
                                { id: "1:home:1", value: 25, confidence: 0.9 }
                            ]
                        })
                    )
                )
            ).transcribe(CROPS)
        ).rejects.toThrow(/missing/i)
    })

    it("demotes a value the game could not have ended on", async () => {
        const readings = await make(
            reply(
                completion(
                    JSON.stringify({
                        readings: [
                            // 33 is not a legal regular-season score
                            { id: "1:home:1", value: 33, confidence: 0.9 },
                            { id: "1:away:1", value: 19, confidence: 0.9 }
                        ]
                    })
                )
            )
        ).transcribe(CROPS)

        const home = readings.find((r) => r.id === "1:home:1")
        expect(home?.value).toBeNull()
        // Kept as a runner-up so reconciliation can still weigh it
        expect(home?.alternatives[0]).toMatchObject({ value: 33 })
    })

    it("reports a service error rather than guessing", async () => {
        await expect(
            make(reply("rate limited", false, 429)).transcribe(CROPS)
        ).rejects.toThrow(/429/)
    })

    it("rejects a reply that is not JSON at all", async () => {
        await expect(
            make(reply(completion("I could not read these."))).transcribe(CROPS)
        ).rejects.toThrow(TranscriberError)
    })

    it("splits a whole sheet across several requests", async () => {
        const many = Array.from({ length: 14 }, (_, i) => crop(`${i}:home:1`))
        const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
            const body = JSON.parse(init.body as string)
            const ids: string[] = body.messages[0].content[0].text
                .match(/\d+:home:1/g)
                .filter(
                    (v: string, i: number, a: string[]) => a.indexOf(v) === i
                )
            return new Response(
                JSON.stringify(
                    completion(
                        JSON.stringify({
                            readings: ids.map((id) => ({
                                id,
                                value: 25,
                                confidence: 0.9
                            }))
                        })
                    )
                )
            )
        }) as unknown as typeof fetch

        const readings = await make(fetchImpl).transcribe(many)
        expect(vi.mocked(fetchImpl).mock.calls.length).toBeGreaterThan(1)
        expect(readings).toHaveLength(14)
    })

    it("keeps the boxes it could read when one request fails", async () => {
        const many = Array.from({ length: 12 }, (_, i) => crop(`${i}:home:1`))
        let call = 0
        const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
            call++
            if (call === 1) return new Response("nope", { status: 500 })
            const body = JSON.parse(init.body as string)
            const ids: string[] = body.messages[0].content[0].text
                .match(/\d+:home:1/g)
                .filter(
                    (v: string, i: number, a: string[]) => a.indexOf(v) === i
                )
            return new Response(
                JSON.stringify(
                    completion(
                        JSON.stringify({
                            readings: ids.map((id) => ({
                                id,
                                value: 25,
                                confidence: 0.9
                            }))
                        })
                    )
                )
            )
        }) as unknown as typeof fetch

        // Losing one request costs its own boxes and nothing else; the rest of
        // the sheet still comes back, and the missing ones read as unreadable.
        const readings = await make(fetchImpl).transcribe(many)
        expect(readings.length).toBeGreaterThan(0)
        expect(readings.length).toBeLessThan(12)
    })

    it("reports a failure only when every request fails", async () => {
        const many = Array.from({ length: 12 }, (_, i) => crop(`${i}:home:1`))
        const fetchImpl = reply("nope", false, 500)
        await expect(make(fetchImpl).transcribe(many)).rejects.toBeInstanceOf(
            TranscriberError
        )
    })

    it("does not call out at all when there is nothing to read", async () => {
        const fetchImpl = reply(completion("{}"))
        expect(await make(fetchImpl).transcribe([])).toEqual([])
        expect(vi.mocked(fetchImpl)).not.toHaveBeenCalled()
    })
})

describe("transcriberFromEnv", () => {
    const saved = { ...process.env }
    afterEach(() => {
        process.env = { ...saved }
    })

    it("stays off until a key is configured", () => {
        process.env.SCORESHEET_MODEL_API_KEY = undefined
        process.env.AI_GATEWAY_API_KEY = undefined
        // Deleting is what an unset variable actually looks like
        delete process.env.SCORESHEET_MODEL_API_KEY
        delete process.env.AI_GATEWAY_API_KEY
        expect(transcriberFromEnv()).toBeNull()
    })

    it("turns on with the Gateway's own key name", () => {
        delete process.env.SCORESHEET_MODEL_API_KEY
        delete process.env.SCORESHEET_MODEL
        process.env.AI_GATEWAY_API_KEY = "gateway-key"
        // The default is a Gateway slug, which is provider/model
        expect(transcriberFromEnv()?.name).toBe("alibaba/qwen3.5-flash")
    })

    it("lets the model be changed without a deploy", () => {
        process.env.AI_GATEWAY_API_KEY = "gateway-key"
        process.env.SCORESHEET_MODEL = "anthropic/claude-haiku-4.5"
        expect(transcriberFromEnv()?.name).toBe("anthropic/claude-haiku-4.5")
    })

    it("prefers an explicit key over the Gateway's", () => {
        process.env.AI_GATEWAY_API_KEY = "gateway-key"
        process.env.SCORESHEET_MODEL_API_KEY = "explicit-key"
        expect(transcriberFromEnv()).not.toBeNull()
    })
})
