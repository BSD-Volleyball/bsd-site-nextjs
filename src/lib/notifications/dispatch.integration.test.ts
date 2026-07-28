import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import {
    emailSuppressions,
    notificationLog,
    notificationOptouts
} from "@/database/schema"
import { sendBatchEmails } from "@/lib/postmark"
import { createUser } from "@/test/session"
import { dispatchNotification } from "./dispatch"
import { getOptedOutTypes, setUserOptouts } from "./preferences"

const mockedSendBatch = vi.mocked(sendBatchEmails)

function recipientOf(user: { id: string; email: string }) {
    return { userId: user.id, email: user.email }
}

describe("dispatchNotification", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("sends to opted-in recipients and logs the send", async () => {
        const user = await createUser()
        const result = await dispatchNotification({
            type: "draft_results",
            recipients: [recipientOf(user)],
            subject: "You've been drafted!",
            htmlBody: "<p>Welcome to the team.</p>"
        })

        expect(result).toEqual({ sent: 1, failed: 0, skipped: 0 })
        expect(mockedSendBatch).toHaveBeenCalledTimes(1)
        const messages = mockedSendBatch.mock.calls[0][0]
        expect(messages).toHaveLength(1)
        expect(messages[0].to).toBe(user.email)
        expect(messages[0].stream).toBe("outbound")
        expect(messages[0].tag).toBe("draft-results")

        const logRows = await db
            .select()
            .from(notificationLog)
            .where(eq(notificationLog.user_id, user.id))
        expect(logRows).toHaveLength(1)
        expect(logRows[0].status).toBe("sent")
        expect(logRows[0].notification_type).toBe("draft_results")
    })

    it("attaches RFC 8058 one-click headers for opt-outable types", async () => {
        const user = await createUser()
        await dispatchNotification({
            type: "draft_results",
            recipients: [recipientOf(user)],
            subject: "s",
            htmlBody: "b"
        })
        const [message] = mockedSendBatch.mock.calls[0][0]
        const headerNames = (message.headers ?? []).map((h) => h.name)
        expect(headerNames).toContain("List-Unsubscribe")
        expect(headerNames).toContain("List-Unsubscribe-Post")
        const unsub = message.headers?.find(
            (h) => h.name === "List-Unsubscribe"
        )
        expect(unsub?.value).toMatch(
            /^<https?:\/\/.+\/api\/email\/unsubscribe\?token=.+>$/
        )
    })

    it("skips recipients who opted out of the type", async () => {
        const optedOut = await createUser()
        const optedIn = await createUser()
        await db.insert(notificationOptouts).values({
            user_id: optedOut.id,
            notification_type: "draft_results"
        })

        const result = await dispatchNotification({
            type: "draft_results",
            recipients: [recipientOf(optedOut), recipientOf(optedIn)],
            subject: "s",
            htmlBody: "b"
        })

        expect(result).toEqual({ sent: 1, failed: 0, skipped: 1 })
        const messages = mockedSendBatch.mock.calls[0][0]
        expect(messages.map((m) => m.to)).toEqual([optedIn.email])
    })

    it("ignores opt-outs for mandatory types", async () => {
        const user = await createUser()
        // A row for a mandatory type can't be created through the API, but
        // even a manually inserted one must not block the send.
        await db.insert(notificationOptouts).values({
            user_id: user.id,
            notification_type: "in_season_updates"
        })

        const result = await dispatchNotification({
            type: "in_season_updates",
            recipients: [recipientOf(user)],
            subject: "s",
            htmlBody: "b"
        })
        expect(result.sent).toBe(1)
        // Mandatory sends carry no unsubscribe headers.
        const [message] = mockedSendBatch.mock.calls[0][0]
        expect(message.headers ?? []).toHaveLength(0)
    })

    it("skips recipients suppressed on the type's stream only", async () => {
        const user = await createUser()
        // Suppressed on broadcast — must NOT block an outbound-stream send.
        await db.insert(emailSuppressions).values({
            user_id: user.id,
            email: user.email.toLowerCase(),
            stream_id: "broadcast",
            reason: "ManualSuppression",
            origin: "Recipient"
        })

        const outbound = await dispatchNotification({
            type: "draft_results",
            recipients: [recipientOf(user)],
            subject: "s",
            htmlBody: "b"
        })
        expect(outbound.sent).toBe(1)

        const broadcast = await dispatchNotification({
            type: "league_announcements",
            recipients: [recipientOf(user)],
            subject: "s",
            htmlBody: "b"
        })
        expect(broadcast).toEqual({ sent: 0, failed: 0, skipped: 1 })
    })

    it("skips recipients with a dead address (bounced/spam) on every stream", async () => {
        const bounced = await createUser({ email_status: "bounced" })
        const result = await dispatchNotification({
            type: "draft_results",
            recipients: [recipientOf(bounced)],
            subject: "s",
            htmlBody: "b"
        })
        expect(result).toEqual({ sent: 0, failed: 0, skipped: 1 })
        expect(mockedSendBatch).not.toHaveBeenCalled()
    })

    it("dedupeKey makes a second dispatch a no-op", async () => {
        const user = await createUser()
        const opts = {
            type: "game_reminder_player" as const,
            recipients: [recipientOf(user)],
            subject: "Match tomorrow",
            htmlBody: "b",
            dedupeKey: "match-42-2026-08-01"
        }

        const first = await dispatchNotification(opts)
        expect(first.sent).toBe(1)

        const second = await dispatchNotification(opts)
        expect(second).toEqual({ sent: 0, failed: 0, skipped: 1 })
        expect(mockedSendBatch).toHaveBeenCalledTimes(1)

        const logRows = await db
            .select()
            .from(notificationLog)
            .where(eq(notificationLog.user_id, user.id))
        expect(logRows).toHaveLength(1)
        expect(logRows[0].status).toBe("sent")
        expect(logRows[0].dedupe_key).toBe("match-42-2026-08-01")
    })

    it("renders per-recipient bodies and dedupes duplicate emails", async () => {
        const user = await createUser({ first_name: "Sam" })
        const result = await dispatchNotification({
            type: "draft_results",
            recipients: [
                { userId: user.id, email: user.email, firstName: "Sam" },
                { userId: user.id, email: user.email.toUpperCase() }
            ],
            subject: (r) => `Hi ${r.firstName ?? "player"}`,
            htmlBody: (r) => `<p>${r.email}</p>`
        })
        expect(result.sent).toBe(1)
        const messages = mockedSendBatch.mock.calls[0][0]
        expect(messages).toHaveLength(1)
        expect(messages[0].subject).toBe("Hi Sam")
    })

    it("records failures without throwing", async () => {
        const user = await createUser()
        mockedSendBatch.mockResolvedValueOnce({
            sent: 0,
            failed: 1,
            results: [{ to: user.email, messageId: null, errorCode: 406 }]
        })

        const result = await dispatchNotification({
            type: "draft_results",
            recipients: [recipientOf(user)],
            subject: "s",
            htmlBody: "b"
        })
        expect(result).toEqual({ sent: 0, failed: 1, skipped: 0 })
        const logRows = await db
            .select()
            .from(notificationLog)
            .where(eq(notificationLog.user_id, user.id))
        expect(logRows[0].status).toBe("failed")
    })
})

describe("preference storage", () => {
    it("setUserOptouts replaces the set and reports the diff", async () => {
        const user = await createUser()

        const first = await setUserOptouts(user.id, [
            "draft_results",
            "tryout_roster"
        ])
        expect(new Set(first.added)).toEqual(
            new Set(["draft_results", "tryout_roster"])
        )
        expect(first.removed).toEqual([])

        const second = await setUserOptouts(user.id, ["draft_results"])
        expect(second.added).toEqual([])
        expect(second.removed).toEqual(["tryout_roster"])

        expect(await getOptedOutTypes(user.id)).toEqual(
            new Set(["draft_results"])
        )
    })

    it("rejects mandatory and unknown types", async () => {
        const user = await createUser()
        await expect(
            setUserOptouts(user.id, ["in_season_updates"])
        ).rejects.toThrow(/mandatory/)
        await expect(
            // biome-ignore lint/suspicious/noExplicitAny: exercising the runtime guard
            setUserOptouts(user.id, ["nope"] as any)
        ).rejects.toThrow(/Unknown/)
    })
})
