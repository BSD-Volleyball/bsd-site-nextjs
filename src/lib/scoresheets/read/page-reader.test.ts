import { afterEach, describe, expect, it, vi } from "vitest"

import {
    createGatewayPageReader,
    DEFAULT_PAGE_MODELS,
    extractJson,
    pageReadersFromEnv,
    pagePrompt,
    PageReaderError,
    parseReply
} from "./page-reader"

const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const MATCHES = [
    { home: "Team Soo", away: "Team Landeo" },
    { home: "Team Pham", away: "Team Stafford" }
]

function game(n: number, top: number | null, bottom: number | null) {
    return { game: n, top, bottom, confidence: "high", note: "" }
}

const GOOD_REPLY = {
    sheetCode: "F26-W5-C1",
    matches: [
        {
            match: 1,
            games: [game(1, 22, 25), game(2, 25, 22), game(3, 20, 25)]
        },
        {
            match: 2,
            games: [game(1, 27, 26), game(2, 22, 25), game(3, null, null)]
        }
    ]
}

function reply(content: string, status = 200) {
    return vi.fn(
        async () =>
            new Response(
                status === 200
                    ? JSON.stringify({ choices: [{ message: { content } }] })
                    : content,
                { status }
            )
    ) as unknown as typeof fetch
}

function make(fetchImpl: typeof fetch) {
    return createGatewayPageReader({
        apiKey: "test-key",
        model: "test/model",
        baseUrl: "https://example.test/v1",
        fetchImpl
    })
}

describe("createGatewayPageReader", () => {
    it("sends the whole photo with the match list, and reads every game", async () => {
        const fetchImpl = reply(JSON.stringify(GOOD_REPLY))
        const reading = await make(fetchImpl).read({
            photo: PHOTO,
            matches: MATCHES,
            eventType: "regular_season"
        })

        expect(reading.model).toBe("test/model")
        expect(reading.sheetCode).toBe("F26-W5-C1")
        expect(reading.matches[0].map((g) => [g.home, g.away])).toEqual([
            [22, 25],
            [25, 22],
            [20, 25]
        ])
        expect(reading.matches[1][2]).toMatchObject({ home: null, away: null })

        const [url, init] = vi.mocked(fetchImpl).mock.calls[0]
        expect(url).toBe("https://example.test/v1/chat/completions")
        const body = JSON.parse(String(init?.body))
        expect(body.model).toBe("test/model")
        // Held to a schema by the provider as well as here
        expect(body.response_format.type).toBe("json_schema")
        const content = body.messages[0].content
        expect(content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/)
        expect(content[0].text).toContain(
            'MATCH #2: top team "Team Pham", bottom team "Team Stafford"'
        )
    })

    it("reports a refused request with its status", async () => {
        const reader = make(reply("No access to this model", 429))
        await expect(
            reader.read({
                photo: PHOTO,
                matches: MATCHES,
                eventType: "regular_season"
            })
        ).rejects.toThrow(/returned 429/)
    })

    it("reads just the printed code when asked", async () => {
        const fetchImpl = reply('{"sheetCode":" F26-W4-C3 "}')
        expect(await make(fetchImpl).readCode(PHOTO)).toBe("F26-W4-C3")
        const body = JSON.parse(
            String(vi.mocked(fetchImpl).mock.calls[0][1]?.body)
        )
        expect(body.messages[0].content[0].text).not.toContain("MATCH #")
    })
})

describe("pagePrompt", () => {
    it("states the night's rules", () => {
        expect(pagePrompt(MATCHES, "regular_season")).toContain(
            "capped at 27 (so 27-26 is a legal final)"
        )
        const playoff = pagePrompt(MATCHES, "playoff")
        expect(playoff).toContain("starts at 4-4")
        expect(playoff).toContain("game 3: to 25, no cap")
    })

    it("tells the reader a lone stroke is a 1", () => {
        // A referee's "11" written as two vertical lines was read as empty
        // boxes by every model until it was told (2026-10-01, Iyer v Kafer).
        expect(pagePrompt(MATCHES, "regular_season")).toContain(
            "single vertical stroke"
        )
    })
})

describe("parseReply", () => {
    it("refuses a reply that leaves out a match", () => {
        const short = { ...GOOD_REPLY, matches: [GOOD_REPLY.matches[0]] }
        expect(() => parseReply("m", short, 2)).toThrow(/left out match 2/)
    })

    it("refuses a reply that leaves out a game", () => {
        const missing = structuredClone(GOOD_REPLY)
        missing.matches[1].games.pop()
        expect(() => parseReply("m", missing, 2)).toThrow(/match 2 game 3/)
    })

    it("refuses a match the sheet does not have", () => {
        const extra = structuredClone(GOOD_REPLY)
        extra.matches.push({ ...extra.matches[0], match: 3 })
        expect(() => parseReply("m", extra, 2)).toThrow(/not on the sheet/)
    })

    it("refuses an impossible number rather than passing it on", () => {
        const silly = structuredClone(GOOD_REPLY)
        silly.matches[0].games[0].top = 250
        expect(() => parseReply("m", silly, 2)).toThrow(PageReaderError)
    })
})

describe("extractJson", () => {
    it("finds the object inside prose and code fences", () => {
        expect(
            extractJson('Here you go:\n```json\n{"a":{"b":"}"}}\n```\nDone {x}')
        ).toEqual({ a: { b: "}" } })
    })

    it("refuses a reply with no JSON in it", () => {
        expect(() => extractJson("I cannot read this photo.")).toThrow(
            PageReaderError
        )
    })
})

describe("pageReadersFromEnv", () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it("is empty with no key, so dev and CI need no secret", () => {
        vi.stubEnv("AI_GATEWAY_API_KEY", "")
        vi.stubEnv("SCORESHEET_MODEL_API_KEY", "")
        expect(pageReadersFromEnv()).toEqual([])
    })

    it("defaults to the measured pair, and can be overridden", () => {
        vi.stubEnv("AI_GATEWAY_API_KEY", "k")
        expect(pageReadersFromEnv().map((r) => r.name)).toEqual([
            ...DEFAULT_PAGE_MODELS
        ])
        vi.stubEnv("SCORESHEET_MODELS", " a/one , b/two ")
        expect(pageReadersFromEnv().map((r) => r.name)).toEqual([
            "a/one",
            "b/two"
        ])
    })
})
