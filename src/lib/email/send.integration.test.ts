import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/database/db"
import {
    emailBroadcasts,
    emailSuppressions,
    notificationLog,
    notificationOptouts,
    users
} from "@/database/schema"
import { sendMail } from "@/lib/email/send"
import { sendBatchEmails } from "@/lib/postmark"
import { sentMessages } from "@/test/email"
import { createUser } from "@/test/session"

const mockedSendBatch = vi.mocked(sendBatchEmails)

/** A member Postmark has told us is permanently undeliverable. */
async function createBouncedUser() {
    const user = await createUser()
    await db
        .update(users)
        .set({ email_status: "bounced" })
        .where(eq(users.id, user.id))
    await db.insert(emailSuppressions).values({
        user_id: user.id,
        email: user.email.toLowerCase(),
        stream_id: "outbound",
        reason: "HardBounce",
        origin: "Recipient"
    })
    return user
}

function bodyFor(user: { id: string; email: string }) {
    return { userId: user.id, email: user.email }
}

/**
 * Broadcast log rows carry a real FK to email_broadcasts, so a broadcast-mode
 * test needs a campaign row to point at.
 */
async function createBroadcast(sentBy: string) {
    const [row] = await db
        .insert(emailBroadcasts)
        .values({
            stream_id: "broadcast",
            subject: "Test broadcast",
            html_content: "<p>x</p>",
            lexical_content: {},
            sent_by: sentBy,
            status: "draft"
        })
        .returning({ id: emailBroadcasts.id })
    return row.id
}

describe("sendMail — mode policy", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    // The whole point of the transactional mode: a member locked out of their
    // account must still be able to receive a reset, even if a bounce record
    // says otherwise. A wrong bounce cannot become a permanent lockout.
    it("transactional reaches a bounced address", async () => {
        const user = await createBouncedUser()

        const result = await sendMail({
            mode: { kind: "transactional", category: "password_reset" },
            recipients: [bodyFor(user)],
            subject: "Reset your password",
            htmlBody: "<p>reset</p>"
        })

        expect(result.sent).toBe(1)
        expect(sentMessages().map((m) => m.to)).toEqual([user.email])
    })

    it("notification skips a bounced address", async () => {
        const user = await createBouncedUser()

        const result = await sendMail({
            mode: { kind: "notification", type: "league_announcements" },
            recipients: [bodyFor(user)],
            subject: "News",
            htmlBody: "<p>news</p>"
        })

        expect(result.sent).toBe(0)
        expect(result.skipped).toBe(1)
        expect(sentMessages()).toHaveLength(0)
    })

    it("staff skips a bounced address", async () => {
        const user = await createBouncedUser()

        const result = await sendMail({
            mode: { kind: "staff", category: "concern_assigned" },
            recipients: [bodyFor(user)],
            subject: "A concern was assigned to you",
            htmlBody: "<p>see it</p>"
        })

        expect(result.sent).toBe(0)
        expect(sentMessages()).toHaveLength(0)
    })

    it("staff ignores notification opt-outs, which do not cover it", async () => {
        const user = await createUser()
        await db.insert(notificationOptouts).values({
            user_id: user.id,
            notification_type: "league_announcements"
        })

        const result = await sendMail({
            mode: { kind: "staff", category: "concern_assigned" },
            recipients: [bodyFor(user)],
            subject: "Operational notice",
            htmlBody: "<p>x</p>"
        })

        expect(result.sent).toBe(1)
    })

    it("prefixes every mode except replies", async () => {
        const user = await createUser()

        await sendMail({
            mode: { kind: "staff", category: "concern_assigned" },
            recipients: [bodyFor(user)],
            subject: "A concern was assigned",
            htmlBody: "<p>x</p>"
        })
        expect(sentMessages()[0].subject).toBe("[BSD] A concern was assigned")
    })

    // Prefixing a reply would produce "[BSD] Re: [BSD] …" and break threading.
    it("leaves a reply subject untouched", async () => {
        const result = await sendMail({
            mode: { kind: "reply", category: "concern_reply" },
            recipients: [{ email: "reporter@example.test" }],
            subject: "Re: Concern #7",
            htmlBody: "<p>reply</p>"
        })

        expect(result.sent).toBe(1)
        expect(sentMessages()[0].subject).toBe("Re: Concern #7")
    })

    it("returns the Postmark id so a reply can be threaded off it", async () => {
        const result = await sendMail({
            mode: { kind: "reply", category: "concern_reply" },
            recipients: [{ email: "Reporter@Example.test" }],
            subject: "Re: Concern #7",
            htmlBody: "<p>reply</p>"
        })

        expect(result.messageIds.get("reporter@example.test")).toBe(
            "test-message-id"
        )
    })
})

describe("sendMail — unsubscribe headers", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("attaches one-click headers to a broadcast", async () => {
        const user = await createUser()
        const broadcastId = await createBroadcast(user.id)

        await sendMail({
            mode: { kind: "broadcast", stream: "broadcast", broadcastId },
            recipients: [bodyFor(user), bodyFor(await createUser())],
            subject: "Season news",
            htmlBody: "<p>news</p>"
        })

        const headers = mockedSendBatch.mock.calls[0][0][0].headers ?? []
        expect(headers.map((h) => h.name)).toEqual(
            expect.arrayContaining([
                "List-Unsubscribe",
                "List-Unsubscribe-Post"
            ])
        )
    })

    it("omits them for staff mail, which has nothing to unsubscribe from", async () => {
        const user = await createUser()

        await sendMail({
            mode: { kind: "staff", category: "concern_assigned" },
            recipients: [bodyFor(user), bodyFor(await createUser())],
            subject: "Notice",
            htmlBody: "<p>x</p>"
        })

        expect(mockedSendBatch.mock.calls[0][0][0].headers).toBeUndefined()
    })
})

describe("sendMail — alwaysInclude", () => {
    it("delivers to an alias even when the audience is entirely filtered out", async () => {
        const bounced = await createBouncedUser()
        const broadcastId = await createBroadcast(bounced.id)

        const result = await sendMail({
            mode: { kind: "broadcast", stream: "broadcast", broadcastId },
            recipients: [bodyFor(bounced)],
            alwaysInclude: ["directors@example.test"],
            subject: "News",
            htmlBody: "<p>news</p>"
        })

        expect(result.sent).toBe(1)
        expect(sentMessages().map((m) => m.to)).toEqual([
            "directors@example.test"
        ])
    })

    it("does not duplicate an alias already in the audience", async () => {
        const user = await createUser()
        const broadcastId = await createBroadcast(user.id)

        await sendMail({
            mode: { kind: "broadcast", stream: "broadcast", broadcastId },
            recipients: [bodyFor(user)],
            alwaysInclude: [user.email.toUpperCase()],
            subject: "News",
            htmlBody: "<p>news</p>"
        })

        expect(sentMessages()).toHaveLength(1)
    })
})

describe("sendMail — logging", () => {
    it("records the mode and category for non-notification mail", async () => {
        const user = await createUser()

        await sendMail({
            mode: { kind: "transactional", category: "signup_confirmation" },
            recipients: [bodyFor(user)],
            subject: "You're registered!",
            htmlBody: "<p>thanks</p>"
        })

        const [row] = await db
            .select()
            .from(notificationLog)
            .where(eq(notificationLog.user_id, user.id))
        expect(row).toMatchObject({
            mode: "transactional",
            notification_type: "signup_confirmation",
            status: "sent",
            subject: "[BSD] You're registered!"
        })
    })

    it("logs an address with no account, so external mail is still traceable", async () => {
        await sendMail({
            mode: { kind: "reply", category: "concern_reply" },
            recipients: [{ email: "outsider@example.test" }],
            subject: "Re: Concern #1",
            htmlBody: "<p>x</p>"
        })

        const [row] = await db
            .select()
            .from(notificationLog)
            .where(eq(notificationLog.email, "outsider@example.test"))
        expect(row.user_id).toBeNull()
        expect(row.mode).toBe("reply")
    })

    // Bounce correlation needs the id on every row, not just single sends.
    it("stores a Postmark id per recipient on a deduped dispatch", async () => {
        const one = await createUser()
        const two = await createUser()

        await sendMail({
            mode: {
                kind: "notification",
                type: "game_reminder_player",
                dedupeKey: "match-1-2026-10-04"
            },
            recipients: [bodyFor(one), bodyFor(two)],
            subject: "Match tomorrow",
            htmlBody: "<p>x</p>"
        })

        const rows = await db
            .select()
            .from(notificationLog)
            .where(eq(notificationLog.dedupe_key, "match-1-2026-10-04"))
        expect(rows).toHaveLength(2)
        for (const row of rows) {
            expect(row.status).toBe("sent")
            expect(row.postmark_message_id).toBe("test-message-id")
        }
    })

    // A stranded 'claimed' row would block that dedupe key forever.
    it("releases claimed rows when the transport throws", async () => {
        const user = await createUser()
        mockedSendBatch.mockRejectedValueOnce(new Error("postmark down"))

        const result = await sendMail({
            mode: {
                kind: "notification",
                type: "game_reminder_player",
                dedupeKey: "match-2-2026-10-04"
            },
            recipients: [bodyFor(user), bodyFor(await createUser())],
            subject: "Match tomorrow",
            htmlBody: "<p>x</p>"
        })

        expect(result.sent).toBe(0)
        const rows = await db
            .select()
            .from(notificationLog)
            .where(eq(notificationLog.dedupe_key, "match-2-2026-10-04"))
        expect(rows).toHaveLength(2)
        for (const row of rows) {
            expect(row.status).toBe("failed")
        }
    })
})
