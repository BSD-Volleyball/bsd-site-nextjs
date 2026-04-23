import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { timingSafeEqual } from "node:crypto"
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
    /** Base64-encoded raw RFC 2822 email. Present when "Include raw email" is enabled on the inbound stream. */
    RawEmail?: string
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
// Postmark Bounce Payload
// https://postmarkapp.com/developer/webhooks/bounce-webhook
// ---------------------------------------------------------------------------

interface PostmarkBouncePayload {
    RecordType: "Bounce"
    MessageStream: string
    Type: string // e.g. 'HardBounce', 'SoftBounce', 'Transient'
    Email: string
    BouncedAt: string
    Description: string
}

// ---------------------------------------------------------------------------
// Postmark Spam Complaint Payload
// https://postmarkapp.com/developer/webhooks/spam-complaint-webhook
// ---------------------------------------------------------------------------

interface PostmarkSpamComplaintPayload {
    RecordType: "SpamComplaint"
    MessageStream: string
    Email: string
    BouncedAt: string
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

async function notifyAdmins(appUrl: string) {
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
                htmlBody: buildInboundEmailNotificationHtml({ appUrl })
            }))
        )
    }
}

async function notifyAssignee(opts: {
    assignedTo: string | null
    appUrl: string
    ticketType: "email" | "concern"
    ticketId: number
}) {
    const label = opts.ticketType === "email" ? "Email" : "Concern"
    const notifSubject = `New Reply on ${label} #${opts.ticketId}`
    const notifHtml = buildThreadReplyNotificationHtml({
        appUrl: opts.appUrl,
        ticketType: opts.ticketType,
        ticketId: opts.ticketId
    })

    if (opts.assignedTo) {
        const [assignee] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, opts.assignedTo))
            .limit(1)

        if (assignee?.email) {
            await sendBatchEmails([
                {
                    from: site.mailFrom,
                    to: assignee.email,
                    subject: notifSubject,
                    htmlBody: notifHtml
                }
            ])
            return
        }
    }

    // No assignee (or assignee has no email) — notify the whole group
    if (opts.ticketType === "email") {
        const adminRows = await db
            .select({ email: users.email })
            .from(userRoles)
            .innerJoin(users, eq(userRoles.user_id, users.id))
            .where(eq(userRoles.role, "admin"))

        const emails = [
            ...new Set(adminRows.map((r) => r.email).filter(Boolean))
        ]
        if (emails.length > 0) {
            await sendBatchEmails(
                emails.map((to) => ({
                    from: site.mailFrom,
                    to,
                    subject: notifSubject,
                    htmlBody: notifHtml
                }))
            )
        }
    } else {
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
                    subject: notifSubject,
                    htmlBody: notifHtml
                }))
            )
        }
    }
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
 * Decode Postmark's base64-encoded RawEmail and return its headers as a
 * PostmarkHeader array. Handles RFC 2822 folded header lines (continuation
 * lines that start with whitespace). Returns an empty array if RawEmail is
 * absent or unparseable.
 */
function parseRawEmailHeaders(
    rawEmail: string | null | undefined
): PostmarkHeader[] {
    if (!rawEmail) return []
    try {
        const decoded = Buffer.from(rawEmail, "base64").toString("utf-8")
        // Headers are everything before the first blank line
        const headerSection = decoded.split(/\r?\n\r?\n/)[0]
        // Unfold headers: continuation lines (starting with whitespace) are joined
        const unfolded = headerSection.replace(/\r?\n([ \t]+)/g, " ")
        const result: PostmarkHeader[] = []
        for (const line of unfolded.split(/\r?\n/)) {
            const colonIdx = line.indexOf(":")
            if (colonIdx > 0) {
                result.push({
                    Name: line.substring(0, colonIdx).trim(),
                    Value: line.substring(colonIdx + 1).trim()
                })
            }
        }
        return result
    } catch {
        return []
    }
}

/**
 * Merge headers from the raw email into the JSON headers array. Raw email
 * headers are more complete (Postmark strips In-Reply-To / References from
 * the JSON payload). For any header name already present in jsonHeaders the
 * JSON value is kept; missing headers are appended from rawHeaders.
 */
function mergeHeaders(
    jsonHeaders: PostmarkHeader[],
    rawHeaders: PostmarkHeader[]
): PostmarkHeader[] {
    const existing = new Set(jsonHeaders.map((h) => h.Name.toLowerCase()))
    const extra = rawHeaders.filter((h) => !existing.has(h.Name.toLowerCase()))
    return [...jsonHeaders, ...extra]
}

/**
 * Returns the matched ticket if this inbound email is a reply to an existing
 * admin-email thread or concern thread. Checks (in order):
 *   1. X-BSD-Ticket-ID custom header
 *   2. In-Reply-To / References against stored postmark_message_ids and
 *      original ticket email IDs
 *   3. Subject-based detection (fallback when headers are stripped by relays)
 */
async function detectExistingThread(
    headers: PostmarkHeader[],
    subject?: string
): Promise<
    { type: "email"; id: number } | { type: "concern"; id: number } | null
> {
    // 1. Custom header (forwarded by some clients)
    const ticketId = getHeader(headers, "X-BSD-Ticket-ID")
    if (ticketId) {
        const emailMatch = ticketId.match(/^email-(\d+)$/)
        if (emailMatch) {
            console.log(
                `[postmark-webhook] Thread detected via X-BSD-Ticket-ID: email-${emailMatch[1]}`
            )
            return { type: "email", id: parseInt(emailMatch[1], 10) }
        }
        const concernMatch = ticketId.match(/^concern-(\d+)$/)
        if (concernMatch) {
            console.log(
                `[postmark-webhook] Thread detected via X-BSD-Ticket-ID: concern-${concernMatch[1]}`
            )
            return { type: "concern", id: parseInt(concernMatch[1], 10) }
        }
    }

    // 2. In-Reply-To / References header matching
    const inReplyTo = getHeader(headers, "In-Reply-To")
    const references = getHeader(headers, "References")
    console.log(
        `[postmark-webhook] In-Reply-To: ${inReplyTo ?? "(none)"}, References: ${references ?? "(none)"}`
    )

    const rawMessageIds = [
        ...parseMessageIds(inReplyTo),
        ...parseMessageIds(references)
    ]

    if (rawMessageIds.length > 0) {
        // Postmark's sendEmail API returns MessageID as just the GUID portion
        // (e.g. "abc123"), but the actual Message-ID email header is
        // "abc123@smtp.postmarkapp.com". Normalise by also including the
        // local-part (before "@") of every incoming ID so we match the stored
        // GUID regardless of any domain suffix the email client may include.
        const messageIds = [
            ...new Set([
                ...rawMessageIds,
                ...rawMessageIds.map((id) => {
                    const atIdx = id.indexOf("@")
                    return atIdx > 0 ? id.substring(0, atIdx) : id
                })
            ])
        ]

        // Check stored postmark_message_id in outbound email replies
        const emailReplyMatch = await db
            .select({ email_id: inboundEmailReplies.email_id })
            .from(inboundEmailReplies)
            .where(inArray(inboundEmailReplies.postmark_message_id, messageIds))
            .limit(1)
        if (emailReplyMatch.length > 0) {
            console.log(
                `[postmark-webhook] Thread detected via email reply message-id: email #${emailReplyMatch[0].email_id}`
            )
            return { type: "email", id: emailReplyMatch[0].email_id }
        }

        // Check stored postmark_message_id in outbound concern replies
        const concernReplyMatch = await db
            .select({ concern_id: concernReplies.concern_id })
            .from(concernReplies)
            .where(inArray(concernReplies.postmark_message_id, messageIds))
            .limit(1)
        if (concernReplyMatch.length > 0) {
            console.log(
                `[postmark-webhook] Thread detected via concern reply message-id: concern #${concernReplyMatch[0].concern_id}`
            )
            return { type: "concern", id: concernReplyMatch[0].concern_id }
        }

        // Check the original inbound email's Postmark MessageID (email_id column)
        const emailOrigMatch = await db
            .select({ id: inboundEmails.id })
            .from(inboundEmails)
            .where(inArray(inboundEmails.email_id, messageIds))
            .limit(1)
        if (emailOrigMatch.length > 0) {
            console.log(
                `[postmark-webhook] Thread detected via original email message-id: email #${emailOrigMatch[0].id}`
            )
            return { type: "email", id: emailOrigMatch[0].id }
        }

        // Check the original concern's inbound Postmark MessageID (source_email_id)
        const concernOrigMatch = await db
            .select({ id: concerns.id })
            .from(concerns)
            .where(inArray(concerns.source_email_id, messageIds))
            .limit(1)
        if (concernOrigMatch.length > 0) {
            console.log(
                `[postmark-webhook] Thread detected via original concern message-id: concern #${concernOrigMatch[0].id}`
            )
            return { type: "concern", id: concernOrigMatch[0].id }
        }
    }

    // 3. Subject-based detection — fallback for when In-Reply-To/References
    //    headers are stripped by intermediate mail relays (e.g. Cloudflare).
    //    Relies on our reply subjects including the ticket ID:
    //      concerns → "Re: Concern #17"
    //      emails   → "Re: Email #7: ..."
    if (subject) {
        const concernSubjectMatch = subject.match(/concern\s*#\s*(\d+)/i)
        if (concernSubjectMatch) {
            const id = parseInt(concernSubjectMatch[1], 10)
            const [ticket] = await db
                .select({ id: concerns.id })
                .from(concerns)
                .where(eq(concerns.id, id))
                .limit(1)
            if (ticket) {
                console.log(
                    `[postmark-webhook] Thread detected via subject: concern #${id}`
                )
                return { type: "concern", id }
            }
        }

        const emailSubjectMatch = subject.match(/\bemail\s*#\s*(\d+)\b/i)
        if (emailSubjectMatch) {
            const id = parseInt(emailSubjectMatch[1], 10)
            const [ticket] = await db
                .select({ id: inboundEmails.id })
                .from(inboundEmails)
                .where(eq(inboundEmails.id, id))
                .limit(1)
            if (ticket) {
                console.log(
                    `[postmark-webhook] Thread detected via subject: email #${id}`
                )
                return { type: "email", id }
            }
        }
    }

    console.log(
        `[postmark-webhook] No existing thread found (subject: ${subject ?? "(none)"})`
    )
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
    const subject = payload.Subject || "(No subject)"
    const bodyText = payload.TextBody || null
    const bodyHtml = payload.HtmlBody || null
    const jsonHeaders = payload.Headers ?? []
    const rawHeaders = parseRawEmailHeaders(payload.RawEmail)
    const headers = mergeHeaders(jsonHeaders, rawHeaders)
    if (rawHeaders.length > 0) {
        console.log(
            `[postmark-webhook] Supplemented ${jsonHeaders.length} JSON headers with ${rawHeaders.length} raw email headers`
        )
    }

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
    const existingThread = await detectExistingThread(headers, subject)

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
                ticketId: existingThread.id
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
                ticketId: existingThread.id
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
        await notifyAdmins(appUrl)
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

        // Only set to 'unsubscribed' if not already at a higher-priority status
        await db
            .update(users)
            .set({ email_status: "unsubscribed" })
            .where(and(eq(users.email, email), eq(users.email_status, "valid")))
    } else {
        // Remove this stream's suppression
        await db
            .delete(emailSuppressions)
            .where(
                and(
                    eq(emailSuppressions.email, email),
                    eq(emailSuppressions.stream_id, streamId)
                )
            )

        // Only clear back to 'valid' if no other suppressions remain
        const remainingSuppressions = await db
            .select({
                id: emailSuppressions.id,
                reason: emailSuppressions.reason
            })
            .from(emailSuppressions)
            .where(eq(emailSuppressions.email, email))

        if (remainingSuppressions.length === 0) {
            await db
                .update(users)
                .set({ email_status: "valid" })
                .where(eq(users.email, email))
        } else {
            // Re-evaluate status from remaining suppressions (highest priority wins)
            const hasHardBounce = remainingSuppressions.some(
                (s) => s.reason === "HardBounce"
            )
            const hasSpam = remainingSuppressions.some(
                (s) => s.reason === "SpamComplaint"
            )
            const newStatus = hasHardBounce
                ? "bounced"
                : hasSpam
                  ? "spam_complaint"
                  : "unsubscribed"
            await db
                .update(users)
                .set({ email_status: newStatus })
                .where(eq(users.email, email))
        }
    }

    console.log(
        `[postmark-webhook] Subscription change: ${email} stream=${streamId} suppressed=${payload.SuppressSending}`
    )
}

// ---------------------------------------------------------------------------
// Bounce handling
// ---------------------------------------------------------------------------

async function handleBounce(payload: PostmarkBouncePayload) {
    const email = payload.Email?.toLowerCase()
    const streamId = payload.MessageStream
    if (!email) return

    const isHardBounce = payload.Type === "HardBounce"

    // Record suppression for all bounce types
    const existing = await db
        .select({ id: emailSuppressions.id })
        .from(emailSuppressions)
        .where(
            and(
                eq(emailSuppressions.email, email),
                eq(emailSuppressions.stream_id, streamId ?? "outbound")
            )
        )
        .limit(1)

    if (existing.length === 0) {
        const [user] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, email))
            .limit(1)

        await db.insert(emailSuppressions).values({
            user_id: user?.id ?? null,
            email,
            stream_id: streamId ?? "outbound",
            reason: payload.Type ?? "HardBounce",
            origin: "Recipient",
            suppressed_at: payload.BouncedAt
                ? new Date(payload.BouncedAt)
                : new Date()
        })
    }

    // Only update email_status for hard bounces (soft bounces are transient)
    if (isHardBounce) {
        await db
            .update(users)
            .set({ email_status: "bounced" })
            .where(eq(users.email, email))
    }

    console.log(
        `[postmark-webhook] Bounce: ${email} type=${payload.Type} stream=${streamId}`
    )
}

// ---------------------------------------------------------------------------
// Spam complaint handling
// ---------------------------------------------------------------------------

async function handleSpamComplaint(payload: PostmarkSpamComplaintPayload) {
    const email = payload.Email?.toLowerCase()
    const streamId = payload.MessageStream
    if (!email) return

    const existing = await db
        .select({ id: emailSuppressions.id })
        .from(emailSuppressions)
        .where(
            and(
                eq(emailSuppressions.email, email),
                eq(emailSuppressions.stream_id, streamId ?? "outbound")
            )
        )
        .limit(1)

    if (existing.length === 0) {
        const [user] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, email))
            .limit(1)

        await db.insert(emailSuppressions).values({
            user_id: user?.id ?? null,
            email,
            stream_id: streamId ?? "outbound",
            reason: "SpamComplaint",
            origin: "Recipient",
            suppressed_at: payload.BouncedAt
                ? new Date(payload.BouncedAt)
                : new Date()
        })
    }

    // Spam complaint takes priority over unsubscribed but not over bounced
    await db
        .update(users)
        .set({ email_status: "spam_complaint" })
        .where(and(eq(users.email, email), eq(users.email_status, "valid")))
    await db
        .update(users)
        .set({ email_status: "spam_complaint" })
        .where(
            and(eq(users.email, email), eq(users.email_status, "unsubscribed"))
        )

    console.log(
        `[postmark-webhook] Spam complaint: ${email} stream=${streamId}`
    )
}

// ---------------------------------------------------------------------------
// Webhook token verification
// ---------------------------------------------------------------------------

function verifyWebhookAuth(request: NextRequest): boolean {
    const user = process.env.POSTMARK_WEBHOOK_USER
    const password = process.env.POSTMARK_WEBHOOK_PASSWORD
    if (!user || !password) {
        console.error(
            "[postmark-webhook] POSTMARK_WEBHOOK_USER/PASSWORD not configured; rejecting request"
        )
        return false
    }

    const authHeader = request.headers.get("authorization")
    if (!authHeader?.startsWith("Basic ")) return false

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8")
    const sepIdx = decoded.indexOf(":")
    if (sepIdx < 0) return false
    const providedUser = decoded.slice(0, sepIdx)
    const providedPassword = decoded.slice(sepIdx + 1)

    const expected = Buffer.from(`${user}:${password}`, "utf-8")
    const provided = Buffer.from(`${providedUser}:${providedPassword}`, "utf-8")
    if (expected.length !== provided.length) return false
    return timingSafeEqual(expected, provided)
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

        if (payload.RecordType === "Bounce") {
            await handleBounce(payload as PostmarkBouncePayload)
            return NextResponse.json({ received: true })
        }

        if (payload.RecordType === "SpamComplaint") {
            await handleSpamComplaint(payload as PostmarkSpamComplaintPayload)
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
