import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The Postmark SDK is replaced wholesale so no network call is made. The mock
// records every batch it is handed, which is what the chunking assertions read.
const sendEmailBatch = vi.fn()

vi.mock("postmark", () => ({
    ServerClient: class {
        sendEmailBatch = sendEmailBatch
    }
}))

import {
    isPermanentBounceType,
    resolveBatchThrottle,
    sendBatchEmails
} from "@/lib/postmark"

function messages(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        from: "info@bumpsetdrink.com",
        to: `player${i}@gmail.com`,
        subject: "Subject",
        htmlBody: "<p>Body</p>"
    }))
}

describe("resolveBatchThrottle", () => {
    const original = { ...process.env }
    afterEach(() => {
        process.env = { ...original }
    })

    it("falls back to throttled defaults when nothing is configured", () => {
        process.env.EMAIL_BATCH_SIZE = undefined
        process.env.EMAIL_BATCH_DELAY_MS = undefined
        const { batchSize, delayMs } = resolveBatchThrottle()
        expect(batchSize).toBeLessThanOrEqual(500)
        expect(batchSize).toBeGreaterThan(0)
        // A default of zero would reproduce the unthrottled burst that got the
        // domain rate limited by Gmail on 2026-07-01.
        expect(delayMs).toBeGreaterThan(0)
    })

    it("reads overrides from the environment", () => {
        process.env.EMAIL_BATCH_SIZE = "25"
        process.env.EMAIL_BATCH_DELAY_MS = "3000"
        expect(resolveBatchThrottle()).toEqual({ batchSize: 25, delayMs: 3000 })
    })

    it("prefers explicit options over the environment", () => {
        process.env.EMAIL_BATCH_SIZE = "25"
        process.env.EMAIL_BATCH_DELAY_MS = "3000"
        expect(resolveBatchThrottle({ batchSize: 10, delayMs: 500 })).toEqual({
            batchSize: 10,
            delayMs: 500
        })
    })

    it("clamps the batch size to Postmark's 500-per-call limit", () => {
        expect(resolveBatchThrottle({ batchSize: 5000 }).batchSize).toBe(500)
    })

    it("rejects nonsense values instead of producing NaN chunks", () => {
        expect(
            resolveBatchThrottle({ batchSize: 0 }).batchSize
        ).toBeGreaterThan(0)
        process.env.EMAIL_BATCH_SIZE = "not-a-number"
        expect(resolveBatchThrottle().batchSize).toBeGreaterThan(0)
        expect(resolveBatchThrottle({ delayMs: -1 }).delayMs).toBe(0)
    })
})

describe("sendBatchEmails", () => {
    beforeEach(() => {
        process.env.POSTMARK_SERVER_TOKEN = "test-token"
        sendEmailBatch.mockReset()
        sendEmailBatch.mockImplementation((chunk: unknown[]) =>
            Promise.resolve(chunk.map(() => ({ ErrorCode: 0, To: "x" })))
        )
    })

    it("splits recipients into chunks of the configured batch size", async () => {
        await sendBatchEmails(messages(250), { batchSize: 100, delayMs: 0 })

        expect(sendEmailBatch).toHaveBeenCalledTimes(3)
        expect(sendEmailBatch.mock.calls[0][0]).toHaveLength(100)
        expect(sendEmailBatch.mock.calls[1][0]).toHaveLength(100)
        expect(sendEmailBatch.mock.calls[2][0]).toHaveLength(50)
    })

    it("sends every recipient exactly once across the chunks", async () => {
        await sendBatchEmails(messages(120), { batchSize: 50, delayMs: 0 })

        const delivered = sendEmailBatch.mock.calls
            .flatMap((call) => call[0] as Array<{ To: string }>)
            .map((m) => m.To)
        expect(delivered).toHaveLength(120)
        expect(new Set(delivered).size).toBe(120)
    })

    it("pauses between chunks but not after the final one", async () => {
        const timeout = vi.spyOn(globalThis, "setTimeout")

        await sendBatchEmails(messages(150), { batchSize: 50, delayMs: 1 })

        // 3 chunks → 2 gaps. A 4th sleep would delay the caller for no reason.
        const sleeps = timeout.mock.calls.filter((c) => c[1] === 1)
        expect(sleeps).toHaveLength(2)
        timeout.mockRestore()
    })

    it("never pauses when everything fits in a single chunk", async () => {
        const timeout = vi.spyOn(globalThis, "setTimeout")

        await sendBatchEmails(messages(3), { batchSize: 50, delayMs: 5000 })

        expect(timeout.mock.calls.filter((c) => c[1] === 5000)).toHaveLength(0)
        timeout.mockRestore()
    })

    it("counts successes and failures across all chunks", async () => {
        sendEmailBatch.mockImplementation((chunk: unknown[]) =>
            Promise.resolve(
                chunk.map((_, i) => ({
                    ErrorCode: i === 0 ? 406 : 0,
                    To: "x",
                    Message: "Inactive recipient"
                }))
            )
        )

        const result = await sendBatchEmails(messages(120), {
            batchSize: 50,
            delayMs: 0
        })

        // One failure per chunk across 3 chunks.
        expect(result.sent).toBe(117)
        expect(result.failed).toBe(3)
        expect(result.results).toHaveLength(120)
        expect(result.results.filter((r) => r.errorCode !== 0)).toHaveLength(3)
    })
})

describe("isPermanentBounceType", () => {
    it("treats hard bounces and spam complaints as permanent", () => {
        expect(isPermanentBounceType("HardBounce")).toBe(true)
        expect(isPermanentBounceType("SpamComplaint")).toBe(true)
    })

    it("treats Gmail's rate-limit SpamNotification as temporary", () => {
        // Postmark maps Gmail's transient "4.7.28 ... temporarily rate limited"
        // onto type SpamNotification. Suppressing on it permanently disabled
        // 724 valid gmail.com recipients on 2026-07-01.
        expect(isPermanentBounceType("SpamNotification")).toBe(false)
    })

    it("treats soft and transient failures as temporary", () => {
        expect(isPermanentBounceType("SoftBounce")).toBe(false)
        expect(isPermanentBounceType("Transient")).toBe(false)
        expect(isPermanentBounceType("DnsError")).toBe(false)
        expect(isPermanentBounceType("Blocked")).toBe(false)
    })

    it("does not suppress on unknown or missing types", () => {
        expect(isPermanentBounceType("SomethingNew")).toBe(false)
        expect(isPermanentBounceType(null)).toBe(false)
        expect(isPermanentBounceType(undefined)).toBe(false)
    })
})
