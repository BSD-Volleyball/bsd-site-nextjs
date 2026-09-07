import { describe, expect, it, vi } from "vitest"
import { isTransientDbError, withTransientRetry } from "./db-retry"

vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}))

describe("isTransientDbError", () => {
    it("recognises deadlock and dropped-connection codes", () => {
        expect(isTransientDbError({ code: "40P01" })).toBe(true)
        expect(isTransientDbError({ code: "08006" })).toBe(true)
        expect(isTransientDbError(new Error("Connection terminated"))).toBe(
            true
        )
    })

    it("looks through the cause chain", () => {
        const err = new Error("wrapped", { cause: { code: "40001" } })
        expect(isTransientDbError(err)).toBe(true)
    })

    it("treats constraint violations as permanent", () => {
        expect(isTransientDbError({ code: "23505" })).toBe(false)
        expect(isTransientDbError(null)).toBe(false)
    })
})

describe("withTransientRetry", () => {
    it("retries a transient failure and returns the eventual result", async () => {
        vi.useFakeTimers()
        let attempts = 0
        const promise = withTransientRetry(async () => {
            attempts++
            if (attempts < 3) throw { code: "40P01" }
            return "done"
        })
        await vi.runAllTimersAsync()
        await expect(promise).resolves.toBe("done")
        expect(attempts).toBe(3)
        vi.useRealTimers()
    })

    it("rethrows a non-transient failure immediately", async () => {
        let attempts = 0
        await expect(
            withTransientRetry(async () => {
                attempts++
                throw { code: "23505" }
            })
        ).rejects.toEqual({ code: "23505" })
        expect(attempts).toBe(1)
    })

    it("gives up after the attempt budget", async () => {
        vi.useFakeTimers()
        let attempts = 0
        const promise = withTransientRetry(async () => {
            attempts++
            throw { code: "40001" }
        }, 2)
        const settled = promise.catch((e) => e)
        await vi.runAllTimersAsync()
        await expect(settled).resolves.toEqual({ code: "40001" })
        expect(attempts).toBe(2)
        vi.useRealTimers()
    })
})
