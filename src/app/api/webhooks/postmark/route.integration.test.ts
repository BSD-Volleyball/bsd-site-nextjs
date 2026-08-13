import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import {
    auditLog,
    concerns,
    emailSuppressions,
    inboundEmails,
    users
} from "@/database/schema"
import { sendBatchEmails, sendEmail } from "@/lib/postmark"
import { createUser } from "@/test/session"
import { POST } from "./route"

const WEBHOOK_USER = "postmark-hook"
const WEBHOOK_PASSWORD = "hook-secret"

function basicAuth(user: string, password: string) {
    return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`
}

function webhookRequest(
    payload: unknown,
    authorization: string | null = basicAuth(WEBHOOK_USER, WEBHOOK_PASSWORD)
) {
    const headers: Record<string, string> = {
        "content-type": "application/json"
    }
    if (authorization) headers.authorization = authorization
    return new NextRequest("https://www.test.local/api/webhooks/postmark", {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
    })
}

async function suppressionsFor(email: string) {
    return db
        .select()
        .from(emailSuppressions)
        .where(eq(emailSuppressions.email, email))
}

async function emailStatusOf(userId: string) {
    const [row] = await db
        .select({ email_status: users.email_status })
        .from(users)
        .where(eq(users.id, userId))
    return row.email_status
}

beforeEach(() => {
    process.env.POSTMARK_WEBHOOK_USER = WEBHOOK_USER
    process.env.POSTMARK_WEBHOOK_PASSWORD = WEBHOOK_PASSWORD
})

describe("POST /api/webhooks/postmark auth", () => {
    it("rejects requests without an Authorization header", async () => {
        const response = await POST(
            webhookRequest({ RecordType: "Bounce" }, null)
        )
        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({ error: "Unauthorized" })
    })

    it("rejects requests with wrong Basic credentials", async () => {
        const response = await POST(
            webhookRequest(
                { RecordType: "Bounce" },
                basicAuth(WEBHOOK_USER, "wrong-password")
            )
        )
        expect(response.status).toBe(401)
    })
})

describe("SubscriptionChange handling", () => {
    it("records a suppression and marks the user unsubscribed", async () => {
        const user = await createUser()

        const response = await POST(
            webhookRequest({
                RecordType: "SubscriptionChange",
                MessageStream: "broadcast",
                Recipient: user.email.toUpperCase(),
                SuppressSending: true,
                SuppressionReason: "ManualSuppression",
                Origin: "Recipient",
                Timestamp: "2026-07-01T12:00:00Z"
            })
        )
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ received: true })

        const rows = await suppressionsFor(user.email)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            user_id: user.id,
            stream_id: "broadcast",
            reason: "ManualSuppression",
            origin: "Recipient"
        })
        expect(await emailStatusOf(user.id)).toBe("unsubscribed")
        expect(vi.mocked(sendBatchEmails)).not.toHaveBeenCalled()
    })

    it("clears the suppression and restores the user on resubscribe", async () => {
        const user = await createUser()
        const suppress = {
            RecordType: "SubscriptionChange",
            MessageStream: "broadcast",
            Recipient: user.email,
            SuppressionReason: "ManualSuppression",
            Origin: "Recipient",
            Timestamp: "2026-07-01T12:00:00Z"
        }
        await POST(webhookRequest({ ...suppress, SuppressSending: true }))
        expect(await suppressionsFor(user.email)).toHaveLength(1)

        const response = await POST(
            webhookRequest({ ...suppress, SuppressSending: false })
        )
        expect(response.status).toBe(200)
        expect(await suppressionsFor(user.email)).toHaveLength(0)
        expect(await emailStatusOf(user.id)).toBe("valid")
    })
})

describe("Bounce handling", () => {
    it("suppresses permanent bounces and marks the address bounced", async () => {
        const user = await createUser()

        const response = await POST(
            webhookRequest({
                RecordType: "Bounce",
                MessageStream: "outbound",
                Type: "HardBounce",
                Email: user.email,
                BouncedAt: "2026-07-01T12:00:00Z",
                Description: "The address does not exist."
            })
        )
        expect(response.status).toBe(200)

        const rows = await suppressionsFor(user.email)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            user_id: user.id,
            stream_id: "outbound",
            reason: "HardBounce"
        })
        expect(await emailStatusOf(user.id)).toBe("bounced")
    })

    it("does not suppress transient bounces", async () => {
        const user = await createUser()

        const response = await POST(
            webhookRequest({
                RecordType: "Bounce",
                MessageStream: "outbound",
                Type: "Transient",
                Email: user.email,
                BouncedAt: "2026-07-01T12:00:00Z",
                Description: "Mailbox temporarily unavailable."
            })
        )
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ received: true })

        expect(await suppressionsFor(user.email)).toHaveLength(0)
        expect(await emailStatusOf(user.id)).toBe("valid")
        expect(vi.mocked(sendBatchEmails)).not.toHaveBeenCalled()
    })
})

// An address going quiet used to leave no attributable trace: the webhook
// flipped users.email_status with only a logger.info. The suppression row
// survives, but nothing said when the account itself changed state.
describe("email status auditing", () => {
    async function auditEntriesFor(userId: string) {
        return db.select().from(auditLog).where(eq(auditLog.user, userId))
    }

    it("audits an unsubscribe and the later resubscribe", async () => {
        const user = await createUser()
        const base = {
            RecordType: "SubscriptionChange",
            MessageStream: "broadcast",
            Recipient: user.email,
            SuppressionReason: "ManualSuppression",
            Origin: "Recipient",
            Timestamp: "2026-07-01T12:00:00Z"
        }

        await POST(webhookRequest({ ...base, SuppressSending: true }))
        await POST(webhookRequest({ ...base, SuppressSending: false }))

        const entries = await auditEntriesFor(user.id)
        expect(entries).toHaveLength(2)
        expect(entries[0].action).toBe("update_email_status")
        expect(entries[0].summary).toContain('set to "unsubscribed"')
        expect(entries[0].summary).toContain("ManualSuppression")
        expect(entries[1].summary).toContain('set to "valid"')
    })

    it("audits a hard bounce", async () => {
        const user = await createUser()

        await POST(
            webhookRequest({
                RecordType: "Bounce",
                Type: "HardBounce",
                TypeCode: 1,
                MessageStream: "outbound",
                Email: user.email,
                BouncedAt: "2026-07-01T12:00:00Z"
            })
        )

        const entries = await auditEntriesFor(user.id)
        expect(entries).toHaveLength(1)
        expect(entries[0].summary).toContain('set to "bounced"')
        expect(entries[0].summary).toContain("HardBounce")
    })

    // Postmark retries deliveries; a redelivery that changes nothing should
    // not accumulate audit noise.
    it("writes nothing when the status does not move", async () => {
        const user = await createUser()
        const payload = {
            RecordType: "SubscriptionChange",
            MessageStream: "broadcast",
            Recipient: user.email,
            SuppressSending: true,
            SuppressionReason: "ManualSuppression",
            Origin: "Recipient",
            Timestamp: "2026-07-01T12:00:00Z"
        }

        await POST(webhookRequest(payload))
        await POST(webhookRequest(payload))

        expect(await auditEntriesFor(user.id)).toHaveLength(1)
    })
})

// ---------------------------------------------------------------------------
// Inbound tickets — a notifier failure used to return HTTP 400, which made
// Postmark redeliver the same message against an already-committed ticket row
// and create a duplicate every retry.
// ---------------------------------------------------------------------------

describe("inbound ticket notifications", () => {
    function inboundEmail(overrides: Record<string, unknown> = {}) {
        return {
            MessageID: `inbound-${Math.abs(Date.now() % 100000)}`,
            From: "outsider@example.test",
            FromName: "An Outsider",
            To: "info@bumpsetdrink.com",
            Subject: "Question about the league",
            TextBody: "How do I sign up?",
            HtmlBody: "<p>How do I sign up?</p>",
            ...overrides
        }
    }

    it("acknowledges with 200 even when the staff notification fails", async () => {
        await createUser()
        vi.mocked(sendBatchEmails).mockRejectedValueOnce(
            new Error("postmark down")
        )
        vi.mocked(sendEmail).mockRejectedValueOnce(new Error("postmark down"))

        const response = await POST(webhookRequest(inboundEmail()))

        // A 400 here would make Postmark retry and duplicate the ticket.
        expect(response.status).toBe(200)

        const tickets = await db.select().from(inboundEmails)
        expect(tickets).toHaveLength(1)
    })

    it("records the ticket exactly once per delivery", async () => {
        await createUser()

        const payload = inboundEmail()
        await POST(webhookRequest(payload))

        const tickets = await db.select().from(inboundEmails)
        expect(tickets).toHaveLength(1)
        expect(tickets[0].from_address).toBe("outsider@example.test")
    })
})

// ---------------------------------------------------------------------------
// Auto-reopen — a reply landing on a closed thread must flip it back to
// active, otherwise it sits unseen in the Closed tab.
// ---------------------------------------------------------------------------

describe("closed thread auto-reopen", () => {
    async function seedEmailThread(status: string) {
        const [ticket] = await db
            .insert(inboundEmails)
            .values({
                email_id: `orig-${status}`,
                from_address: "outsider@example.test",
                from_name: "An Outsider",
                to_address: "info@bumpsetdrink.com",
                subject: "Question about the league",
                body_text: "How do I sign up?",
                status
            })
            .returning({ id: inboundEmails.id })
        return ticket.id
    }

    function replyTo(ticketHeader: string) {
        return {
            MessageID: `reply-${ticketHeader}`,
            From: "outsider@example.test",
            FromName: "An Outsider",
            To: "info@bumpsetdrink.com",
            Subject: "Re: Question about the league",
            TextBody: "Following up on this.",
            HtmlBody: "<p>Following up on this.</p>",
            Headers: [{ Name: "X-BSD-Ticket-ID", Value: ticketHeader }]
        }
    }

    it("reopens a closed email thread when a reply arrives", async () => {
        await createUser()
        const ticketId = await seedEmailThread("closed")

        const response = await POST(
            webhookRequest(replyTo(`email-${ticketId}`))
        )
        expect(response.status).toBe(200)

        const [ticket] = await db
            .select({ status: inboundEmails.status })
            .from(inboundEmails)
            .where(eq(inboundEmails.id, ticketId))
        expect(ticket.status).toBe("active")
    })

    it("reopens a closed concern thread when a reply arrives", async () => {
        await createUser()
        const [seeded] = await db
            .insert(concerns)
            .values({
                anonymous: false,
                contact_name: "An Outsider",
                contact_email: "outsider@example.test",
                want_followup: false,
                incident_date: "2026-07-01",
                location: "Submitted via email",
                person_involved: "Someone",
                description: "A concern",
                status: "closed",
                source: "email",
                source_email_id: "concern-orig"
            })
            .returning({ id: concerns.id })

        const response = await POST(
            webhookRequest(replyTo(`concern-${seeded.id}`))
        )
        expect(response.status).toBe(200)

        const [ticket] = await db
            .select({ status: concerns.status })
            .from(concerns)
            .where(eq(concerns.id, seeded.id))
        expect(ticket.status).toBe("active")
    })

    it("leaves a spam email thread as spam", async () => {
        await createUser()
        const ticketId = await seedEmailThread("spam")

        await POST(webhookRequest(replyTo(`email-${ticketId}`)))

        const [ticket] = await db
            .select({ status: inboundEmails.status })
            .from(inboundEmails)
            .where(eq(inboundEmails.id, ticketId))
        expect(ticket.status).toBe("spam")
    })

    it("leaves a new email thread as new", async () => {
        await createUser()
        const ticketId = await seedEmailThread("new")

        await POST(webhookRequest(replyTo(`email-${ticketId}`)))

        const [ticket] = await db
            .select({ status: inboundEmails.status })
            .from(inboundEmails)
            .where(eq(inboundEmails.id, ticketId))
        expect(ticket.status).toBe("new")
    })
})
