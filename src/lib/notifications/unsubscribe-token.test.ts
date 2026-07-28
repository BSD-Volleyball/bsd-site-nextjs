import { createHmac } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
    createUnsubscribeToken,
    verifyUnsubscribeToken
} from "./unsubscribe-token"

const SECRET_KEY = "NOTIFICATION_UNSUB_SECRET"

describe("unsubscribe tokens", () => {
    let previous: string | undefined

    beforeEach(() => {
        previous = process.env[SECRET_KEY]
        process.env[SECRET_KEY] = "test-secret"
    })

    afterEach(() => {
        if (previous === undefined) delete process.env[SECRET_KEY]
        else process.env[SECRET_KEY] = previous
    })

    it("round-trips userId and type", () => {
        const token = createUnsubscribeToken("user-123", "draft_results")
        expect(token).toBeTruthy()
        expect(verifyUnsubscribeToken(token as string)).toEqual({
            userId: "user-123",
            type: "draft_results"
        })
    })

    it("rejects a tampered payload", () => {
        const token = createUnsubscribeToken("user-123", "draft_results")
        const forged = Buffer.from(
            JSON.stringify({ u: "user-456", t: "draft_results" })
        ).toString("base64url")
        const [, signature] = (token as string).split(".")
        expect(verifyUnsubscribeToken(`${forged}.${signature}`)).toBeNull()
    })

    it("rejects a tampered signature and garbage", () => {
        const token = createUnsubscribeToken("user-123", "draft_results")
        expect(verifyUnsubscribeToken(`${token}x`)).toBeNull()
        expect(verifyUnsubscribeToken("not-a-token")).toBeNull()
        expect(verifyUnsubscribeToken("")).toBeNull()
    })

    it("rejects tokens naming unknown types", () => {
        // Forge with the real secret but a bogus type: signature is valid,
        // the type check must still refuse it.
        const payload = Buffer.from(
            JSON.stringify({ u: "user-123", t: "bogus_type" })
        ).toString("base64url")
        const sig = createHmac("sha256", "test-secret")
            .update(payload)
            .digest("base64url")
        expect(verifyUnsubscribeToken(`${payload}.${sig}`)).toBeNull()
    })

    it("returns null when the secret is unset", () => {
        delete process.env[SECRET_KEY]
        expect(createUnsubscribeToken("user-123", "draft_results")).toBeNull()
        expect(verifyUnsubscribeToken("anything.at-all")).toBeNull()
    })
})
