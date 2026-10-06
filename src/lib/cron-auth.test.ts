import { afterEach, describe, expect, it } from "vitest"
import { isAuthorizedCronRequest } from "./cron-auth"

function request(authorization?: string) {
    return new Request("https://league.example/api/cron/x", {
        headers: authorization ? { authorization } : {}
    })
}

describe("isAuthorizedCronRequest", () => {
    const original = process.env.CRON_SECRET
    afterEach(() => {
        process.env.CRON_SECRET = original
    })

    it("accepts the exact bearer secret", () => {
        process.env.CRON_SECRET = "s3cret"
        expect(isAuthorizedCronRequest(request("Bearer s3cret"))).toBe(true)
    })

    it.each([undefined, "Bearer wrong!", "Bearer s3cre", "s3cret"])(
        "rejects %s",
        (header) => {
            process.env.CRON_SECRET = "s3cret"
            expect(isAuthorizedCronRequest(request(header))).toBe(false)
        }
    )

    it("rejects everything when CRON_SECRET is unset", () => {
        delete process.env.CRON_SECRET
        expect(isAuthorizedCronRequest(request("Bearer "))).toBe(false)
        expect(isAuthorizedCronRequest(request("Bearer undefined"))).toBe(false)
    })
})
