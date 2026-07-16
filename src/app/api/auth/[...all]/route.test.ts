import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { checkBotIdMock, handlerPostMock } = vi.hoisted(() => ({
    checkBotIdMock: vi.fn(),
    handlerPostMock: vi.fn()
}))

vi.mock("botid/server", () => ({ checkBotId: checkBotIdMock }))
vi.mock("better-auth/next-js", () => ({
    toNextJsHandler: () => ({ GET: vi.fn(), POST: handlerPostMock })
}))
vi.mock("@/lib/auth", () => ({ auth: {} }))

import { POST } from "./route"

function signInRequest() {
    return new NextRequest(
        "https://www.bumpsetdrink.com/api/auth/sign-in/social",
        {
            method: "POST",
            headers: { "user-agent": "TestBrowser/1.0" },
            body: JSON.stringify({ provider: "google" })
        }
    )
}

describe("auth route BotID gate", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    })

    afterEach(() => {
        warnSpy.mockRestore()
        vi.clearAllMocks()
    })

    it("denies flagged requests with a user-visible message and logs the denial", async () => {
        checkBotIdMock.mockResolvedValue({ isBot: true })

        const response = await POST(signInRequest())

        expect(response.status).toBe(403)
        const body = await response.json()
        // better-auth-ui toasts the top-level `message` field of error bodies
        expect(body.code).toBe("BOT_DETECTED")
        expect(body.message).toMatch(/content blocker/i)
        expect(handlerPostMock).not.toHaveBeenCalled()

        expect(warnSpy).toHaveBeenCalledTimes(1)
        const logged = warnSpy.mock.calls[0].join(" ")
        expect(logged).toContain("/api/auth/sign-in/social")
        expect(logged).toContain("TestBrowser/1.0")
    })

    it("passes non-bot requests through to the auth handler without logging", async () => {
        checkBotIdMock.mockResolvedValue({ isBot: false })
        const upstream = Response.json({ ok: true })
        handlerPostMock.mockResolvedValue(upstream)

        const request = signInRequest()
        const response = await POST(request)

        expect(handlerPostMock).toHaveBeenCalledWith(request)
        expect(response).toBe(upstream)
        expect(warnSpy).not.toHaveBeenCalled()
    })
})
