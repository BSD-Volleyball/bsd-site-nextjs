import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { db } from "@/database/db"
import {
    concerns,
    concernReceived,
    concernReplies,
    inboundEmails,
    inboundEmailReceived,
    inboundEmailReplies,
    users,
    userRoles,
    emailSuppressions
} from "@/database/schema"
import { eq, and, inArray } from "drizzle-orm"
import { site } from "@/config/site"
import { sendBatchEmails } from "@/lib/postmark"
import {
    buildConcernNotificationHtml,
    buildInboundEmailNotificationHtml,
    buildThreadReplyNotificationHtml
} from "@/lib/email-html"

// ---------------------------------------------------------------------------
// Postmark Inbound Email Payload (subset of fields we use)
// https://postmarkapp.com/developer/webhooks/inbound-webhook
// ---------------------------------------------------------------------------

interface PostmarkHeader {
    Name: string
    Value: string
}

interface PostmarkInboundPayload {
    MessageID: string
    From: string
    FromName: string
    FromFull: { Email: string; Name: string }
    To: string
    ToFull: Array<{ Email: string; Name: string }>
    Subject: string
    TextBody: string
    HtmlBody: string
    Tag: string
    MessageStream: string
    Headers: PostmarkHeader[]
}

// ---------------------------------------------------------------------------
// Postmark Subscription Change Payload
// https://postmarkapp.com/developer/webhooks/subscription-change-webhook
// ---------------------------------------------------------------------------

interface PostmarkSubscriptionChangePayload {
    RecordType: "SubscriptionChange"
    MessageStream: string
    Recipient: string
    SuppressSending: boolean
    SuppressionReason: string | null
    Origin: string
    Timestamp: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFromAddress(from: string): {
    name: string | null
    email: string
} {
    const match = from.match(/^(.+?)\s*<(.+?)>$/)
    if (match) {
        return {
            name: match[1].trim().replace(/^"|"$/g, ""),
            email: match[2].trim()
        }
    }
    return { name: null, email: from.trim() }
}

async function notifyOmbudsmen(appUrl: string) {
    const ombudsmenRows = await db
        .select({ email: users.email })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.user_id, users.id))
        .where(eq(userRoles.role, "ombudsman"))

    const emails = [
        ...new Set(ombudsmenRows.map((r) => r.email).filter(Boolean))
    ]

    if (emails.length > 0) {
        await sendBatchEmails(
            emails.map((to) => ({
                from: site.mailFrom,
                to,
                subject: "New Concern Submitted via Email",
                htmlBody: buildConcernNotificationHtml(appUrl)
            }))
        )
    }
}

async function notifyAdmins(appUrl: string, subject: string, from: string) {
    const adminRows = await db
        .select({ email: users.email })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.user_id, users.id))
        .where(eq(userRoles.role, "admin"))

    const emails = [...new Set(adminRows.map((r) => r.email).filter(Boolean))]

    if (emails.length > 0) {
        await sendBatchEmails(
            emails.map((to) => ({
                from: site.mailFrom,
                to,
                subject: "New Inbound Email Received",
                htmlBody: buildInboundEmailNotificationHtml({
                    appUrl,
                    from,
                    subject
                })
            }))
        )
    }
}

async function notifyAssignee(opts: {
    assignedTo: string | null
    appUrl: string
    ticketType: "email" | "concern"
    ticketId: number
    subject: string
    from: string
    bodyPreview: string | null
}) {
    if (!opts.assignedTo) return

    const [assignee] = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, opts.assignedTo))
        .limit(1)

    if (!assignee?.email) return

    const label = opts.ticketType === "email" ? "Email" : "Concern"
    await sendBatchEmails([
        {
            from: site.mailFrom,
            to: assignee.email,
            subject: `New Reply on ${label} #${opts.ticketId}: ${opts.subject}`,
            htmlBody: buildThreadReplyNotificationHtml({
                appUrl: opts.appUrl,
                ticketType: opts.ticketType,
                ticketId: opts.ticketId,
                subject: opts.subject,
                from: opts.from,
                bodyPreview: opts.bodyPreview
            })
        }
    ])
}

// ---------------------------------------------------------------------------
// Thread detection helpers
// ---------------------------------------------------------------------------

function getHeader(headers: PostmarkHeader[], name: string): string | null {
    const lower = name.toLowerCase()
    return headers.find((h) => h.Name.toLowerCase() === lower)?.Value ?? null
}

/**
 * Parse a list of Message-IDs from an In-Reply-To or References header.
 * Returns cleaned IDs with angle brackets stripped.
 */
function parseMessageIds(header: string | null): string[] {
    if (!header) return []
    return header
        .split(/\s+/)
        .map((s) => s.replace(/^<|>$/g, "").trim())
        .filter(Boolean)
}

/**
 * Returns the matched ticket if this inbound email is a reply to an existing
 * admin-email thread or concern thread. Checks:
 *   1. X-BSD-Ticket-ID custom header (most reliable)
 *   2. In-Reply-To / References against stored postmark_message_ids
 */
async function detectExistingThread(
    headers: PostmarkHeader[]
): Promise<
    { type: "email"; id: number } | { type: "concern"; id: number } | null
> {
    // 1. Custom header (primary)
    const ticketId = getHeader(headers, "X-BSD-Ticket-ID")
    if (ticketId) {
        const emailMatch = ticketId.match(/^email-(\d+)$/)
        if (emailMatch) return { type: "email", id: parseInt(emailMatch[1]) }
        const concernMatch = ticketId.match(/^concern-(\d+)$/)
        if (concernMatch)
            return { type: "concern", id: parseInt(concernMatch[1]) }
    }

    // 2. In-Reply-To / References fallback
    const inReplyTo = getHeader(headers, "In-Reply-To")
    const references = getHeader(headers, "References")
    const messageIds = [
        ...parseMessageIds(inReplyTo),
        ...parseMessageIds(references)
    ]
    if (messageIds.length === 0) return null

    // Check against stored postmark_message_id in email replies
    const emailReplyMatch = await db
        .select({ email_id: inboundEmailReplies.email_id })
        .from(inboundEmailReplies)
        .where(inArray(inboundEmailReplies.postmark_message_id, messageIds))
        .limit(1)
    if (emailReplyMatch.length > 0) {
        return { type: "email", id: emailReplyMatch[0].email_id }
    }

    // Check against stored postmark_message_id in concern replies
    const concernReplyMatch = await db
        .select({ concern_id: concernReplies.concern_id })
        .from(concernReplies)
        .where(inArray(concernReplies.postmark_message_id, messageIds))
        .limit(1)
    if (concernReplyMatch.length > 0) {
        return { type: "concern", id: concernReplyMatch[0].concern_id }
    }

    return null
}

// ---------------------------------------------------------------------------
// Inbound email handling
// ---------------------------------------------------------------------------

async function handleInboundEmail(payload: PostmarkInboundPayload) {
    const messageId = payload.MessageID
    const fromEmail =
        payload.FromFull?.Email ?? parseFromAddress(payload.From).email
    const fromName =
        payload.FromFull?.Name ?? parseFromAddress(payload.From).name
    const from = payload.From
    const subject = payload.Subject || "(No subject)"
    const bodyText = payload.TextBody || null
    const bodyHtml = payload.HtmlBody || null
    const headers = payload.Headers ?? []

    const toAddresses = payload.ToFull?.map((t) => t.Email.toLowerCase()) ?? []
    const concernAddress = (
        process.env.INBOUND_CONCERN_ADDRESS ?? ""
    ).toLowerCase()

    const isConcern =
        concernAddress &&
        (toAddresses.includes(concernAddress) ||
            payload.To.toLowerCase().includes(concernAddress))

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://bumpsetdrink.com"

    // Check if this is a reply to an existing thread
    const existingThread = await detectExistingThread(headers)

    if (existingThread) {
        if (existingThread.type === "email") {
            // Fetch assignee before inserting so we have it for notification
            const [ticket] = await db
                .select({ assigned_to: inboundEmails.assigned_to })
                .from(inboundEmails)
                .where(eq(inboundEmails.id, existingThread.id))
                .limit(1)

            await db.insert(inboundEmailReceived).values({
                email_id: existingThread.id,
                from_address: fromEmail,
                from_name: fromName,
                subject,
                body_text: bodyText,
                body_html: bodyHtml,
                postmark_message_id: messageId
            })

            await notifyAssignee({
                assignedTo: ticket?.assigned_to ?? null,
                appUrl,
                ticketType: "email",
                ticketId: existingThread.id,
                subject,
                from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
                bodyPreview: bodyText
            })

            console.log(
                `[postmark-webhook] Routed reply to email thread #${existingThread.id}`
            )
        } else {
            const [ticket] = await db
                .select({ assigned_to: concerns.assigned_to })
                .from(concerns)
                .where(eq(concerns.id, existingThread.id))
                .limit(1)

            await db.insert(concernReceived).values({
                concern_id: existingThread.id,
                from_address: fromEmail,
                from_name: fromName,
                subject,
                body_text: bodyText,
                body_html: bodyHtml,
                postmark_message_id: messageId
            })

            await notifyAssignee({
                assignedTo: ticket?.assigned_to ?? null,
                appUrl,
                ticketType: "concern",
                ticketId: existingThread.id,
                subject,
                from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
                bodyPreview: bodyText
            })

            console.log(
                `[postmark-webhook] Routed reply to concern thread #${existingThread.id}`
            )
        }
        return
    }

    if (isConcern) {
        await db.insert(concerns).values({
            user_id: null,
            anonymous: false,
            contact_name: fromName,
            contact_email: fromEmail,
            contact_phone: null,
            want_followup: false,
            incident_date: new Date().toISOString().split("T")[0],
            location: "Submitted via email",
            person_involved: subject,
            description: bodyText || bodyHtml || "(No email body)",
            status: "new",
            source: "email",
            source_email_id: messageId
        })
        await notifyOmbudsmen(appUrl)
    } else {
        await db.insert(inboundEmails).values({
            email_id: messageId,
            from_address: fromEmail,
            from_name: fromName,
            to_address: toAddresses[0] || payload.To,
            subject,
            body_text: bodyText,
            body_html: bodyHtml,
            status: "new"
        })
        await notifyAdmins(appUrl, subject, from)
    }
}

// ---------------------------------------------------------------------------
// Subscription change handling
// ---------------------------------------------------------------------------

async function handleSubscriptionChange(
    payload: PostmarkSubscriptionChangePayload
) {
    const email = payload.Recipient?.toLowerCase()
    const streamId = payload.MessageStream
    if (!email || !streamId) return

    if (payload.SuppressSending) {
        // Upsert suppression record
        const existing = await db
            .select({ id: emailSuppressions.id })
            .from(emailSuppressions)
            .where(
                and(
                    eq(emailSuppressions.email, email),
                    eq(emailSuppressions.stream_id, streamId)
                )
            )
            .limit(1)

        if (existing.length === 0) {
            // Try to find user_id
            const [user] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.email, email))
                .limit(1)

            await db.insert(emailSuppressions).values({
                user_id: user?.id ?? null,
                email,
                stream_id: streamId,
                reason: payload.SuppressionReason ?? "ManualSuppression",
                origin: payload.Origin ?? "Recipient",
                suppressed_at: payload.Timestamp
                    ? new Date(payload.Timestamp)
                    : new Date()
            })
        }

        // Update users.unsubscribed for backward compatibility
        await db
            .update(users)
            .set({ unsubscribed: true })
            .where(eq(users.email, email))
    } else {
        // Remove suppression
        await db
            .delete(emailSuppressions)
            .where(
                and(
                    eq(emailSuppressions.email, email),
                    eq(emailSuppressions.stream_id, streamId)
                )
            )

        // Check if user has any remaining suppressions before clearing the flag
        const remainingSuppressions = await db
            .select({ id: emailSuppressions.id })
            .from(emailSuppressions)
            .where(eq(emailSuppressions.email, email))
            .limit(1)

        if (remainingSuppressions.length === 0) {
            await db
                .update(users)
                .set({ unsubscribed: false })
                .where(eq(users.email, email))
        }
    }

    console.log(
        `[postmark-webhook] Subscription change: ${email} stream=${streamId} suppressed=${payload.SuppressSending}`
    )
}

// ---------------------------------------------------------------------------
// Webhook token verification
// ---------------------------------------------------------------------------

function verifyWebhookAuth(request: NextRequest): boolean {
    const user = process.env.POSTMARK_WEBHOOK_USER
    const password = process.env.POSTMARK_WEBHOOK_PASSWORD
    if (!user && !password) return true // No credentials configured = skip verification

    const authHeader = request.headers.get("authorization")
    if (!authHeader?.startsWith("Basic ")) return false

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8")
    const [providedUser, providedPassword] = decoded.split(":")
    return providedUser === user && providedPassword === password
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    if (!verifyWebhookAuth(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const payload = await request.json()

        // Postmark uses RecordType to distinguish webhook types
        if (payload.RecordType === "SubscriptionChange") {
            await handleSubscriptionChange(
                payload as PostmarkSubscriptionChangePayload
            )
            return NextResponse.json({ received: true })
        }

        // Inbound emails have no RecordType but have MessageID + From + To
        if (payload.MessageID && payload.From && !payload.RecordType) {
            await handleInboundEmail(payload as PostmarkInboundPayload)
            return NextResponse.json({ received: true })
        }

        // Other webhook types (bounces, opens, etc.) — acknowledge but ignore
        console.log(
            `[postmark-webhook] Unhandled RecordType: ${payload.RecordType ?? "unknown"}`
        )
        return NextResponse.json({ received: true })
    } catch (error) {
        console.error("[postmark-webhook] Error:", error)
        return NextResponse.json(
            { error: "Webhook processing failed" },
            { status: 400 }
        )
    }
}
