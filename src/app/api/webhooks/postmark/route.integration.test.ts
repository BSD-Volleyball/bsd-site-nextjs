import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import {
    auditLog,
    concerns,
    emailAttachments,
    emailSuppressions,
    inboundEmails,
    inboundEmailReceived,
    users
} from "@/database/schema"
import { sendBatchEmails, sendEmail } from "@/lib/postmark"
import { deleteR2Object, getR2Object, putR2Object } from "@/lib/r2"
import { createUser, createUserWithRoles } from "@/test/session"
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

/** Every notification body handed to the (mocked) Postmark send layer. */
function sentHtmlBodies(): string[] {
    const single = vi
        .mocked(sendEmail)
        .mock.calls.map(([opts]) => opts.htmlBody)
    const batch = vi
        .mocked(sendBatchEmails)
        .mock.calls.flatMap(([messages]) => messages.map((m) => m.htmlBody))
    return [...single, ...batch]
}

/** Every notification subject handed to the (mocked) Postmark send layer. */
function sentSubjects(): string[] {
    const single = vi.mocked(sendEmail).mock.calls.map(([opts]) => opts.subject)
    const batch = vi
        .mocked(sendBatchEmails)
        .mock.calls.flatMap(([messages]) => messages.map((m) => m.subject))
    return [...single, ...batch]
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

    it("links the new-ticket notification directly to the created ticket", async () => {
        await createUserWithRoles([{ role: "admin" }])

        await POST(webhookRequest(inboundEmail()))

        const [ticket] = await db
            .select({ id: inboundEmails.id })
            .from(inboundEmails)
        expect(sentHtmlBodies().join("\n")).toContain(
            `/dashboard/manage-emails?email=${ticket.id}`
        )
    })

    it("names the sender and subject in the new-ticket notification", async () => {
        await createUserWithRoles([{ role: "admin" }])

        await POST(webhookRequest(inboundEmail()))

        const body = sentHtmlBodies().join("\n")
        expect(body).toContain("An Outsider")
        expect(body).toContain("outsider@example.test")
        expect(body).toContain("Question about the league")
        expect(sentSubjects().join("\n")).toContain(
            "New Inbound Email from An Outsider: Question about the league"
        )
    })

    it("keeps concern notifications content-free", async () => {
        process.env.INBOUND_CONCERN_ADDRESS = "concerns@bumpsetdrink.com"
        await createUserWithRoles([{ role: "ombudsman" }])

        await POST(
            webhookRequest(
                inboundEmail({
                    To: "concerns@bumpsetdrink.com",
                    Subject: "A sensitive matter"
                })
            )
        )
        delete process.env.INBOUND_CONCERN_ADDRESS

        const body = sentHtmlBodies().join("\n")
        expect(body).not.toContain("An Outsider")
        expect(body).not.toContain("outsider@example.test")
        expect(body).not.toContain("A sensitive matter")
        expect(sentSubjects().join("\n")).not.toContain("A sensitive matter")
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

    it("links the staff notification directly to the thread", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const ticketId = await seedEmailThread("active")

        await POST(webhookRequest(replyTo(`email-${ticketId}`)))

        expect(sentHtmlBodies().join("\n")).toContain(
            `/dashboard/manage-emails?email=${ticketId}`
        )
    })

    it("names the sender and subject in the email-reply notification", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const ticketId = await seedEmailThread("active")

        await POST(webhookRequest(replyTo(`email-${ticketId}`)))

        const body = sentHtmlBodies().join("\n")
        expect(body).toContain("An Outsider")
        expect(body).toContain("outsider@example.test")
        expect(body).toContain("Re: Question about the league")
        expect(sentSubjects().join("\n")).toContain(
            `New Reply on Email #${ticketId} from An Outsider: Re: Question about the league`
        )
    })

    it("keeps concern-reply notifications content-free", async () => {
        await createUserWithRoles([{ role: "ombudsman" }])
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
                status: "active",
                source: "email",
                source_email_id: "concern-orig-notify"
            })
            .returning({ id: concerns.id })

        await POST(webhookRequest(replyTo(`concern-${seeded.id}`)))

        const body = sentHtmlBodies().join("\n")
        expect(body).toContain("/dashboard/manage-concerns")
        expect(body).not.toContain("An Outsider")
        expect(body).not.toContain("outsider@example.test")
        expect(body).not.toContain("Question about the league")
        expect(sentSubjects().join("\n")).toContain(
            `New Reply on Concern #${seeded.id}`
        )
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

// ---------------------------------------------------------------------------
// Attachments — Postmark inlines them as base64; bytes go to R2 and a
// metadata row is recorded against whichever message carried the file.
// ---------------------------------------------------------------------------

describe("inbound attachments", () => {
    const PNG_BYTES = Buffer.from("fake-png-bytes")
    const attachments = [
        {
            Name: "court map.png",
            Content: PNG_BYTES.toString("base64"),
            ContentType: "image/png",
            ContentLength: PNG_BYTES.length,
            ContentID: "map@mail"
        },
        {
            Name: "../notes.txt",
            Content: Buffer.from("hello").toString("base64"),
            ContentType: "text/plain",
            ContentLength: 5,
            ContentID: ""
        }
    ]

    function inboundWithAttachments(overrides: Record<string, unknown> = {}) {
        return {
            MessageID: "attach-1",
            From: "outsider@example.test",
            FromName: "An Outsider",
            To: "info@bumpsetdrink.com",
            Subject: "See attached",
            TextBody: "Attached.",
            HtmlBody: '<p>Attached.</p><img src="cid:map@mail">',
            Attachments: attachments,
            ...overrides
        }
    }

    it("stores each attachment against the new ticket", async () => {
        await createUser()

        const response = await POST(webhookRequest(inboundWithAttachments()))
        expect(response.status).toBe(200)

        const [ticket] = await db
            .select({ id: inboundEmails.id })
            .from(inboundEmails)
        const rows = await db
            .select()
            .from(emailAttachments)
            .orderBy(emailAttachments.id)
        expect(rows).toHaveLength(2)
        expect(rows[0]).toMatchObject({
            parent_type: "email",
            parent_id: ticket.id,
            filename: "court map.png",
            content_type: "image/png",
            size_bytes: PNG_BYTES.length,
            content_id: "map@mail"
        })
        // Path separators are stripped from sender-supplied names.
        expect(rows[1]).toMatchObject({
            filename: "_notes.txt",
            content_id: null
        })
        expect(rows[1].r2_key).toMatch(/^email-attachments\/attach-1\/1-/)

        expect(vi.mocked(putR2Object)).toHaveBeenCalledTimes(2)
        const [firstUpload] = vi.mocked(putR2Object).mock.calls[0]
        expect(firstUpload.contentType).toBe("image/png")
        expect(Buffer.compare(firstUpload.body, PNG_BYTES)).toBe(0)
        expect(firstUpload.key).toBe(rows[0].r2_key)
    })

    it("attaches files on a thread reply to the received message", async () => {
        await createUser()
        const [ticket] = await db
            .insert(inboundEmails)
            .values({
                email_id: "orig-attach",
                from_address: "outsider@example.test",
                to_address: "info@bumpsetdrink.com",
                subject: "See attached",
                status: "active"
            })
            .returning({ id: inboundEmails.id })

        await POST(
            webhookRequest(
                inboundWithAttachments({
                    MessageID: "attach-reply",
                    Headers: [
                        { Name: "X-BSD-Ticket-ID", Value: `email-${ticket.id}` }
                    ]
                })
            )
        )

        const [received] = await db
            .select({ id: inboundEmailReceived.id })
            .from(inboundEmailReceived)
        const rows = await db.select().from(emailAttachments)
        expect(rows).toHaveLength(2)
        for (const row of rows) {
            expect(row.parent_type).toBe("email_received")
            expect(row.parent_id).toBe(received.id)
        }
    })

    it("attaches files to a concern created from email", async () => {
        process.env.INBOUND_CONCERN_ADDRESS = "concerns@bumpsetdrink.com"
        try {
            await createUser()
            await POST(
                webhookRequest(
                    inboundWithAttachments({
                        MessageID: "attach-concern",
                        To: "concerns@bumpsetdrink.com"
                    })
                )
            )

            const [concern] = await db
                .select({ id: concerns.id })
                .from(concerns)
            const rows = await db.select().from(emailAttachments)
            expect(rows).toHaveLength(2)
            expect(rows[0]).toMatchObject({
                parent_type: "concern",
                parent_id: concern.id
            })
        } finally {
            delete process.env.INBOUND_CONCERN_ADDRESS
        }
    })

    it("still acknowledges and keeps the ticket when an upload fails", async () => {
        await createUser()
        vi.mocked(putR2Object).mockRejectedValueOnce(new Error("r2 down"))

        const response = await POST(webhookRequest(inboundWithAttachments()))

        // A non-2xx here would make Postmark redeliver and duplicate the ticket.
        expect(response.status).toBe(200)
        expect(await db.select().from(inboundEmails)).toHaveLength(1)
        // The failed file is skipped; the second one still lands.
        const rows = await db.select().from(emailAttachments)
        expect(rows).toHaveLength(1)
        expect(rows[0].filename).toBe("_notes.txt")
    })

    it("treats a redelivered MessageID as a backfill, not a new ticket", async () => {
        await createUser()
        // First delivery predates attachment capture: ticket exists, no files.
        await POST(webhookRequest(inboundWithAttachments({ Attachments: [] })))
        expect(await db.select().from(emailAttachments)).toHaveLength(0)

        // Postmark redelivers the same MessageID, now with attachments.
        const response = await POST(webhookRequest(inboundWithAttachments()))
        expect(response.status).toBe(200)

        const tickets = await db.select().from(inboundEmails)
        expect(tickets).toHaveLength(1)
        const rows = await db.select().from(emailAttachments)
        expect(rows).toHaveLength(2)
        expect(rows[0]).toMatchObject({
            parent_type: "email",
            parent_id: tickets[0].id
        })

        // A third delivery must not duplicate the files either.
        await POST(webhookRequest(inboundWithAttachments()))
        expect(await db.select().from(emailAttachments)).toHaveLength(2)
        expect(await db.select().from(inboundEmails)).toHaveLength(1)
    })

    it("records nothing for a message without attachments", async () => {
        await createUser()
        await POST(webhookRequest(inboundWithAttachments({ Attachments: [] })))
        expect(await db.select().from(emailAttachments)).toHaveLength(0)
        expect(vi.mocked(putR2Object)).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// Spooled inbound — the Cloudflare Worker streams Postmark's JSON into R2 and
// posts only the object key; the route fetches, dispatches, and deletes it.
// ---------------------------------------------------------------------------

describe("spooled inbound", () => {
    const SPOOL_KEY = "inbound-spool/0f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b.json"
    const FILE_BYTES = Buffer.from("spooled-file")

    function inboundPayload(overrides: Record<string, unknown> = {}) {
        return {
            MessageID: "spool-1",
            From: "outsider@example.test",
            FromName: "An Outsider",
            To: "info@bumpsetdrink.com",
            Subject: "Big photo",
            TextBody: "See attached.",
            HtmlBody: "<p>See attached.</p>",
            Attachments: [
                {
                    Name: "photo.jpg",
                    Content: FILE_BYTES.toString("base64"),
                    ContentType: "image/jpeg",
                    ContentLength: FILE_BYTES.length,
                    ContentID: ""
                }
            ],
            ...overrides
        }
    }

    /** Make the R2 mock hand back `payload` as the spooled object. */
    function spool(payload: unknown, lengthOverride?: number) {
        const json = JSON.stringify(payload)
        const contentLength = Buffer.byteLength(json)
        vi.mocked(getR2Object).mockResolvedValueOnce({
            body: new Blob([json]).stream(),
            contentType: "application/json",
            contentLength: lengthOverride ?? contentLength
        })
        return contentLength
    }

    function envelope(overrides: Record<string, unknown> = {}) {
        return {
            RecordType: "BSDSpooledInbound",
            SpoolKey: SPOOL_KEY,
            ContentLength: 1,
            ...overrides
        }
    }

    it("processes the spooled payload and deletes the spool object", async () => {
        await createUser()
        const length = spool(inboundPayload())

        const response = await POST(
            webhookRequest(envelope({ ContentLength: length }))
        )

        expect(response.status).toBe(200)
        expect(vi.mocked(getR2Object)).toHaveBeenCalledWith(SPOOL_KEY)
        const tickets = await db.select().from(inboundEmails)
        expect(tickets).toHaveLength(1)
        expect(tickets[0]).toMatchObject({
            email_id: "spool-1",
            subject: "Big photo"
        })
        const files = await db.select().from(emailAttachments)
        expect(files).toHaveLength(1)
        expect(files[0]).toMatchObject({
            parent_type: "email",
            parent_id: tickets[0].id,
            filename: "photo.jpg",
            size_bytes: FILE_BYTES.length
        })
        expect(vi.mocked(putR2Object)).toHaveBeenCalledWith(
            expect.objectContaining({ body: FILE_BYTES })
        )
        expect(vi.mocked(deleteR2Object)).toHaveBeenCalledWith(SPOOL_KEY)
    })

    it("still requires the webhook credentials", async () => {
        const response = await POST(webhookRequest(envelope(), null))
        expect(response.status).toBe(401)
        expect(vi.mocked(getR2Object)).not.toHaveBeenCalled()
    })

    it("rejects a missing spool object without deleting anything", async () => {
        // Default getR2Object mock resolves null.
        const response = await POST(webhookRequest(envelope()))

        expect(response.status).toBe(400)
        expect(await db.select().from(inboundEmails)).toHaveLength(0)
        expect(vi.mocked(deleteR2Object)).not.toHaveBeenCalled()
    })

    it.each([
        ["wrong prefix", "email-attachments/x/0-secret.pdf"],
        ["path traversal", "inbound-spool/../users.json"],
        ["not a uuid", "inbound-spool/latest.json"],
        [
            "uuid-ish garbage",
            "inbound-spool/------------------------------------.json"
        ]
    ])("rejects a bad SpoolKey (%s) before touching R2", async (_, key) => {
        const response = await POST(
            webhookRequest(envelope({ SpoolKey: key, ContentLength: 10 }))
        )
        expect(response.status).toBe(400)
        expect(vi.mocked(getR2Object)).not.toHaveBeenCalled()
    })

    it.each([
        0,
        -1,
        1.5,
        "10",
        200 * 1024 * 1024
    ])("rejects a bad ContentLength (%s) before touching R2", async (length) => {
        const response = await POST(
            webhookRequest(envelope({ ContentLength: length }))
        )
        expect(response.status).toBe(400)
        expect(vi.mocked(getR2Object)).not.toHaveBeenCalled()
    })

    it("rejects a spool object whose length disagrees with the envelope", async () => {
        await createUser()
        const length = spool(inboundPayload())
        const response = await POST(
            webhookRequest(envelope({ ContentLength: length + 1 }))
        )
        expect(response.status).toBe(400)
        expect(await db.select().from(inboundEmails)).toHaveLength(0)
        expect(vi.mocked(deleteR2Object)).not.toHaveBeenCalled()
    })

    it("rejects a spool object that is not JSON and keeps it", async () => {
        vi.mocked(getR2Object).mockResolvedValueOnce({
            body: new Blob(["{not json"]).stream(),
            contentType: "application/json",
            contentLength: 9
        })
        const response = await POST(
            webhookRequest(envelope({ ContentLength: 9 }))
        )
        expect(response.status).toBe(400)
        expect(vi.mocked(deleteR2Object)).not.toHaveBeenCalled()
    })

    it("keeps the spool object when processing throws", async () => {
        // A spooled inbound whose To is missing makes handleInboundEmail throw.
        const length = spool(
            inboundPayload({ To: undefined, ToFull: undefined })
        )
        const response = await POST(
            webhookRequest(envelope({ ContentLength: length }))
        )
        expect(response.status).toBe(400)
        expect(vi.mocked(deleteR2Object)).not.toHaveBeenCalled()
    })

    it("treats a second spool of the same MessageID as a redelivery", async () => {
        await createUser()
        const first = spool(inboundPayload())
        await POST(webhookRequest(envelope({ ContentLength: first })))

        const otherKey =
            "inbound-spool/11111111-2222-4333-8444-555555555555.json"
        const second = spool(inboundPayload())
        const response = await POST(
            webhookRequest(
                envelope({ SpoolKey: otherKey, ContentLength: second })
            )
        )

        expect(response.status).toBe(200)
        expect(await db.select().from(inboundEmails)).toHaveLength(1)
        expect(await db.select().from(emailAttachments)).toHaveLength(1)
        expect(vi.mocked(deleteR2Object)).toHaveBeenCalledWith(SPOOL_KEY)
        expect(vi.mocked(deleteR2Object)).toHaveBeenCalledWith(otherKey)
    })
})

// ---------------------------------------------------------------------------
// Overlapping deliveries — Postmark retrying while a slow first attempt is
// still running must not mint a second ticket.
// ---------------------------------------------------------------------------

describe("concurrent redelivery", () => {
    function inbound(messageId: string, to = "info@bumpsetdrink.com") {
        return {
            MessageID: messageId,
            From: "outsider@example.test",
            FromName: "An Outsider",
            To: to,
            ToFull: [{ Email: to, Name: "" }],
            Subject: "Racing",
            TextBody: "Hello",
            HtmlBody: "<p>Hello</p>"
        }
    }

    it("creates exactly one email ticket for two simultaneous deliveries", async () => {
        await createUser()
        const responses = await Promise.all([
            POST(webhookRequest(inbound("race-1"))),
            POST(webhookRequest(inbound("race-1")))
        ])
        expect(responses.map((r) => r.status)).toEqual([200, 200])
        expect(await db.select().from(inboundEmails)).toHaveLength(1)
    })

    it("creates exactly one concern for two simultaneous deliveries", async () => {
        process.env.INBOUND_CONCERN_ADDRESS = "concerns@bumpsetdrink.com"
        await createUser()
        const responses = await Promise.all([
            POST(
                webhookRequest(inbound("race-2", "concerns@bumpsetdrink.com"))
            ),
            POST(webhookRequest(inbound("race-2", "concerns@bumpsetdrink.com")))
        ])
        expect(responses.map((r) => r.status)).toEqual([200, 200])
        expect(await db.select().from(concerns)).toHaveLength(1)
    })

    it("records exactly one received reply for two simultaneous deliveries", async () => {
        await createUser()
        await POST(webhookRequest(inbound("orig-3")))
        const [ticket] = await db
            .select({ id: inboundEmails.id })
            .from(inboundEmails)

        const reply = {
            ...inbound("reply-3"),
            Subject: `Re: Email #${ticket.id}: Racing`
        }
        const responses = await Promise.all([
            POST(webhookRequest(reply)),
            POST(webhookRequest(reply))
        ])
        expect(responses.map((r) => r.status)).toEqual([200, 200])
        expect(await db.select().from(inboundEmailReceived)).toHaveLength(1)
    })
})
