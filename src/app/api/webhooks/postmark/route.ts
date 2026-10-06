import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { db } from "@/database/db"
import {
    type AttachmentParentType,
    concerns,
    concernReceived,
    concernReplies,
    inboundEmails,
    inboundEmailReceived,
    inboundEmailReplies,
    users,
    emailSuppressions
} from "@/database/schema"
import { eq, and, inArray } from "drizzle-orm"
import { site } from "@/config/site"
import { logAuditEntry } from "@/lib/audit-log"
import { getRecipientsWithRole } from "@/lib/rbac"
import { logger } from "@/lib/logger"
import { sendMail } from "@/lib/email/send"
import { isPermanentBounceType } from "@/lib/postmark"
import {
    buildConcernNotificationHtml,
    buildInboundEmailNotificationHtml,
    buildThreadReplyNotificationHtml,
    type InboundMessageSummary
} from "@/lib/email-html"
import { recomputeEmailStatus } from "@/lib/notifications/suppressions"
import {
    listAttachmentsFor,
    storeInboundAttachments
} from "@/lib/email-attachments"
import { deleteR2Object, getR2Object } from "@/lib/r2"

// A spooled inbound message can carry up to 35 MB of attachments; fetching,
// parsing and re-uploading those needs more than the default budget.
export const maxDuration = 300

// ---------------------------------------------------------------------------
// Postmark Inbound Email Payload (subset of fields we use)
// https://postmarkapp.com/developer/webhooks/inbound-webhook
// ---------------------------------------------------------------------------

// Payloads are parsed, not cast. The schemas are deliberately lenient (only
// fields this route reads, extra fields kept, blanks tolerated) because a
// rejected inbound message is a lost email; a payload that still fails is
// answered 400 so it stays in Postmark's activity for a manual retry.
const postmarkHeaderSchema = z.object({ Name: z.string(), Value: z.string() })
type PostmarkHeader = z.infer<typeof postmarkHeaderSchema>

const postmarkAddressSchema = z.looseObject({
    Email: z.string(),
    Name: z.string().nullish()
})

const postmarkInboundSchema = z.looseObject({
    MessageID: z.string().min(1),
    From: z.string(),
    FromName: z.string().nullish(),
    FromFull: postmarkAddressSchema.nullish(),
    To: z
        .string()
        .nullish()
        .transform((to) => to ?? ""),
    ToFull: z.array(postmarkAddressSchema).nullish(),
    Subject: z.string().nullish(),
    TextBody: z.string().nullish(),
    HtmlBody: z.string().nullish(),
    Headers: z.array(postmarkHeaderSchema).nullish(),
    /** Base64-encoded raw RFC 2822 email. Present when "Include raw email" is enabled on the inbound stream. */
    RawEmail: z.string().nullish(),
    /** Base64-inline attachments; empty array when the message has none. */
    Attachments: z
        .array(
            z.looseObject({
                Name: z.string(),
                Content: z.string(),
                ContentType: z.string(),
                ContentLength: z.number(),
                ContentID: z.string().nullish()
            })
        )
        .nullish()
})
type PostmarkInboundPayload = z.infer<typeof postmarkInboundSchema>

// https://postmarkapp.com/developer/webhooks/subscription-change-webhook
const postmarkSubscriptionChangeSchema = z.looseObject({
    RecordType: z.literal("SubscriptionChange"),
    MessageStream: z.string(),
    Recipient: z.string(),
    SuppressSending: z.boolean(),
    SuppressionReason: z.string().nullish(),
    Origin: z.string().nullish(),
    Timestamp: z.string().nullish()
})
type PostmarkSubscriptionChangePayload = z.infer<
    typeof postmarkSubscriptionChangeSchema
>

// https://postmarkapp.com/developer/webhooks/bounce-webhook
const postmarkBounceSchema = z.looseObject({
    RecordType: z.literal("Bounce"),
    MessageStream: z.string(),
    Type: z.string(), // e.g. 'HardBounce', 'SoftBounce', 'Transient'
    Email: z.string(),
    BouncedAt: z.string().nullish(),
    Description: z.string().nullish()
})
type PostmarkBouncePayload = z.infer<typeof postmarkBounceSchema>

// https://postmarkapp.com/developer/webhooks/spam-complaint-webhook
const postmarkSpamComplaintSchema = z.looseObject({
    RecordType: z.literal("SpamComplaint"),
    MessageStream: z.string(),
    Email: z.string(),
    BouncedAt: z.string().nullish()
})
type PostmarkSpamComplaintPayload = z.infer<typeof postmarkSpamComplaintSchema>

// ---------------------------------------------------------------------------
// Spooled inbound envelope (our own, not Postmark's)
//
// Vercel rejects request bodies over 4.5 MB at the edge, while Postmark
// inlines up to 35 MB of attachments as base64. The Cloudflare Worker in
// workers/postmark-inbound/ takes Postmark's POST, streams the raw JSON into
// R2, and calls this route with only the object key. Everything else about
// inbound handling is unchanged: the spooled JSON is the exact Postmark
// payload and goes through the same dispatch as an inline one.
// ---------------------------------------------------------------------------

interface PostmarkSpooledEnvelope {
    RecordType: "BSDSpooledInbound"
    /** R2 object key holding the verbatim Postmark JSON. */
    SpoolKey: string
    /** Byte length the Worker wrote, cross-checked against the object. */
    ContentLength: number
}

const SPOOL_KEY_PATTERN =
    /^inbound-spool\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/
// Postmark caps attachments at 35 MB (~48 MB base64); anything near the
// Worker's own 90 MB cap is a RawEmail regression, not a legitimate email.
const SPOOL_MAX_BYTES = 120 * 1024 * 1024

/** Shape-check the envelope; the key pattern also pins it to our prefix. */
function parseSpooledEnvelope(
    payload: Record<string, unknown>
): PostmarkSpooledEnvelope | null {
    const key = payload.SpoolKey
    const length = payload.ContentLength
    if (typeof key !== "string" || !SPOOL_KEY_PATTERN.test(key)) return null
    if (
        typeof length !== "number" ||
        !Number.isInteger(length) ||
        length <= 0 ||
        length > SPOOL_MAX_BYTES
    ) {
        return null
    }
    return {
        RecordType: "BSDSpooledInbound",
        SpoolKey: key,
        ContentLength: length
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Mask an email address for log output (j***@example.com): enough to
// correlate a report with a user without writing raw PII into the logs.
function maskEmail(email: string): string {
    const [local, domain] = email.split("@")
    if (!domain) return "***"
    return `${local.slice(0, 1)}***@${domain}`
}

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

/**
 * Staff notifications are best-effort by construction.
 *
 * These run *after* the ticket row is committed, so a throw here used to
 * escape to the route handler, return HTTP 400, and make Postmark redeliver
 * the same inbound message — creating a duplicate ticket every retry.
 * sendMail already never throws; this guard covers the role lookups too.
 */
async function notifyQuietly(fn: () => Promise<unknown>, context: string) {
    try {
        await fn()
    } catch (error) {
        logger.error(`[postmark-webhook] ${context} notification failed`, {
            error: error instanceof Error ? error.message : String(error)
        })
    }
}

async function notifyOmbudsmen(appUrl: string) {
    await sendMail({
        mode: { kind: "staff", category: "concern_submitted_by_email" },
        recipients: await getRecipientsWithRole("ombudsman"),
        subject: "New Concern Submitted via Email",
        htmlBody: buildConcernNotificationHtml(appUrl),
        tag: "concern-notification"
    })
}

/**
 * "Jane Doe: Question about the league" — the sender and subject as they
 * should read in a notification subject line. Falls back to the address when
 * the sender has no display name.
 */
function describeInbound(message: InboundMessageSummary): string {
    const sender = message.fromName?.trim() || message.fromAddress || "unknown"
    return `from ${sender}: ${message.subject ?? "(No subject)"}`
}

async function notifyAdmins(opts: {
    appUrl: string
    ticketId: number
    message: InboundMessageSummary
}) {
    await sendMail({
        mode: { kind: "staff", category: "inbound_email_received" },
        recipients: await getRecipientsWithRole("admin"),
        subject: `New Inbound Email ${describeInbound(opts.message)}`,
        htmlBody: buildInboundEmailNotificationHtml({
            appUrl: opts.appUrl,
            ticketId: opts.ticketId,
            ...opts.message
        }),
        tag: "inbound-email-notification"
    })
}

async function notifyAssignee(opts: {
    assignedTo: string | null
    appUrl: string
    ticketType: "email" | "concern"
    ticketId: number
    /** Sender + subject; only forwarded for email threads, never concerns. */
    message?: InboundMessageSummary
}) {
    const label = opts.ticketType === "email" ? "Email" : "Concern"
    // Concern notifications stay content-free: the concern inbox is far more
    // sensitive than general email, so the nudge says only that a reply exists.
    const message = opts.ticketType === "email" ? opts.message : undefined
    const notifHtml = buildThreadReplyNotificationHtml({
        appUrl: opts.appUrl,
        ticketType: opts.ticketType,
        ticketId: opts.ticketId,
        ...message
    })

    // The assignee if there is one; otherwise the whole group that owns
    // this kind of ticket, so a reply is never left unseen.
    let recipients: { userId: string; email: string }[] = []
    if (opts.assignedTo) {
        const [assignee] = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(eq(users.id, opts.assignedTo))
            .limit(1)
        if (assignee?.email) {
            recipients = [{ userId: assignee.id, email: assignee.email }]
        }
    }
    if (recipients.length === 0) {
        recipients = await getRecipientsWithRole(
            opts.ticketType === "email" ? "admin" : "ombudsman"
        )
    }

    await sendMail({
        mode: { kind: "staff", category: "thread_reply" },
        recipients,
        subject: message
            ? `New Reply on ${label} #${opts.ticketId} ${describeInbound(message)}`
            : `New Reply on ${label} #${opts.ticketId}`,
        htmlBody: notifHtml,
        tag: "thread-reply-notification"
    })
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
/**
 * Has this address already taken part in the thread? A ticket id in a header
 * or subject is guessable (ids are sequential), so a match on it only counts
 * when the sender is the original sender/reporter or has written into the
 * thread before. Otherwise anyone could append mail to, and reopen, any
 * concern by sending "Re: Concern #12". Message-ID matches need no such check:
 * those ids are ones we issued and cannot be guessed.
 */
async function senderOnThread(
    thread: { type: "email" | "concern"; id: number },
    senderEmail: string
): Promise<boolean> {
    const sender = senderEmail.trim().toLowerCase()
    if (!sender) return false
    const known: (string | null | undefined)[] = []

    if (thread.type === "email") {
        const [original] = await db
            .select({ from: inboundEmails.from_address })
            .from(inboundEmails)
            .where(eq(inboundEmails.id, thread.id))
            .limit(1)
        known.push(original?.from)
        const replies = await db
            .select({ from: inboundEmailReceived.from_address })
            .from(inboundEmailReceived)
            .where(eq(inboundEmailReceived.email_id, thread.id))
        known.push(...replies.map((r) => r.from))
    } else {
        const [concern] = await db
            .select({
                contact: concerns.contact_email,
                userEmail: users.email
            })
            .from(concerns)
            .leftJoin(users, eq(concerns.user_id, users.id))
            .where(eq(concerns.id, thread.id))
            .limit(1)
        known.push(concern?.contact, concern?.userEmail)
        const replies = await db
            .select({ from: concernReceived.from_address })
            .from(concernReceived)
            .where(eq(concernReceived.concern_id, thread.id))
        known.push(...replies.map((r) => r.from))
    }

    return known.some((address) => address?.trim().toLowerCase() === sender)
}

async function detectExistingThread(
    headers: PostmarkHeader[],
    subject: string | undefined,
    senderEmail: string
): Promise<
    { type: "email"; id: number } | { type: "concern"; id: number } | null
> {
    // Header and subject matches are only trusted from a thread participant.
    const fromParticipant = async (
        thread: { type: "email"; id: number } | { type: "concern"; id: number },
        via: string
    ) => {
        if (await senderOnThread(thread, senderEmail)) {
            logger.info(`[postmark-webhook] Thread detected via ${via}`, {
                threadType: thread.type,
                ticketId: thread.id
            })
            return thread
        }
        logger.warn(
            `[postmark-webhook] Ignored ${via} match from a non-participant`,
            { threadType: thread.type, ticketId: thread.id }
        )
        return null
    }

    // 1. Custom header (forwarded by some clients)
    const ticketId = getHeader(headers, "X-BSD-Ticket-ID")
    if (ticketId) {
        const emailMatch = ticketId.match(/^email-(\d+)$/)
        if (emailMatch) {
            const thread = await fromParticipant(
                { type: "email", id: parseInt(emailMatch[1], 10) },
                "X-BSD-Ticket-ID"
            )
            if (thread) return thread
        }
        const concernMatch = ticketId.match(/^concern-(\d+)$/)
        if (concernMatch) {
            const thread = await fromParticipant(
                { type: "concern", id: parseInt(concernMatch[1], 10) },
                "X-BSD-Ticket-ID"
            )
            if (thread) return thread
        }
    }

    // 2. In-Reply-To / References header matching
    const inReplyTo = getHeader(headers, "In-Reply-To")
    const references = getHeader(headers, "References")
    logger.info("[postmark-webhook] Reply headers", {
        inReplyTo: inReplyTo ?? "(none)",
        references: references ?? "(none)"
    })

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
            logger.info(
                "[postmark-webhook] Thread detected via email reply message-id",
                { threadType: "email", ticketId: emailReplyMatch[0].email_id }
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
            logger.info(
                "[postmark-webhook] Thread detected via concern reply message-id",
                {
                    threadType: "concern",
                    ticketId: concernReplyMatch[0].concern_id
                }
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
            logger.info(
                "[postmark-webhook] Thread detected via original email message-id",
                { threadType: "email", ticketId: emailOrigMatch[0].id }
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
            logger.info(
                "[postmark-webhook] Thread detected via original concern message-id",
                { threadType: "concern", ticketId: concernOrigMatch[0].id }
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
                const thread = await fromParticipant(
                    { type: "concern", id },
                    "subject"
                )
                if (thread) return thread
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
                const thread = await fromParticipant(
                    { type: "email", id },
                    "subject"
                )
                if (thread) return thread
            }
        }
    }

    logger.info("[postmark-webhook] No existing thread found", {
        subjectLength: subject?.length ?? 0
    })
    return null
}

// ---------------------------------------------------------------------------
// Inbound email handling
// ---------------------------------------------------------------------------

/**
 * Locate the row a Postmark MessageID was already recorded against, if any.
 * Postmark retries and manual redeliveries carry the same MessageID, so this
 * is what keeps a redelivery from minting a duplicate ticket.
 */
async function findRecordedMessage(
    messageId: string
): Promise<{ parentType: AttachmentParentType; parentId: number } | null> {
    const [email] = await db
        .select({ id: inboundEmails.id })
        .from(inboundEmails)
        .where(eq(inboundEmails.email_id, messageId))
        .limit(1)
    if (email) return { parentType: "email", parentId: email.id }

    const [emailReceived] = await db
        .select({ id: inboundEmailReceived.id })
        .from(inboundEmailReceived)
        .where(eq(inboundEmailReceived.postmark_message_id, messageId))
        .limit(1)
    if (emailReceived) {
        return { parentType: "email_received", parentId: emailReceived.id }
    }

    const [concern] = await db
        .select({ id: concerns.id })
        .from(concerns)
        .where(eq(concerns.source_email_id, messageId))
        .limit(1)
    if (concern) return { parentType: "concern", parentId: concern.id }

    const [concernRecv] = await db
        .select({ id: concernReceived.id })
        .from(concernReceived)
        .where(eq(concernReceived.postmark_message_id, messageId))
        .limit(1)
    if (concernRecv) {
        return { parentType: "concern_received", parentId: concernRecv.id }
    }

    return null
}

/** Postgres unique_violation, whether raised directly or wrapped by Drizzle. */
function isUniqueViolation(error: unknown): boolean {
    const code = (error as { code?: unknown })?.code
    if (code === "23505") return true
    const cause = (error as { cause?: { code?: unknown } })?.cause
    return cause?.code === "23505"
}

/**
 * Run an insert keyed by a Postmark MessageID. The partial unique indexes on
 * those columns turn an overlapping redelivery (Postmark retrying while a
 * slow first attempt is still running) into a unique violation here, which
 * is reported as `null` so the caller can stop without minting a duplicate.
 */
async function insertUnlessRedelivered<T>(
    insert: () => Promise<T>
): Promise<T | null> {
    try {
        return await insert()
    } catch (error) {
        if (isUniqueViolation(error)) return null
        throw error
    }
}

async function handleInboundEmail(payload: PostmarkInboundPayload) {
    const messageId = payload.MessageID

    // Redelivery of a message we already hold: don't create anything new.
    // The one useful thing a redelivery can carry is attachments that were
    // dropped the first time (before attachment capture existed), so store
    // those if the message has none on record yet.
    const recorded = await findRecordedMessage(messageId)
    if (recorded) {
        const existing = await listAttachmentsFor(recorded.parentType, [
            recorded.parentId
        ])
        const backfill = (existing.get(recorded.parentId) ?? []).length === 0
        if (backfill) {
            await storeInboundAttachments({
                ...recorded,
                messageId,
                attachments: payload.Attachments
            })
        }
        logger.info("[postmark-webhook] Ignored redelivery of known message", {
            ...recorded,
            attachmentsBackfilled: backfill
                ? (payload.Attachments?.length ?? 0)
                : 0
        })
        return
    }
    const fromEmail =
        payload.FromFull?.Email ?? parseFromAddress(payload.From).email
    // Postmark sends the display name both in FromFull and as FromName; either
    // may be an empty string for a bare address, so treat blanks as missing.
    const fromName =
        payload.FromFull?.Name ||
        payload.FromName ||
        parseFromAddress(payload.From).name
    const subject = payload.Subject || "(No subject)"
    const bodyText = payload.TextBody || null
    const bodyHtml = payload.HtmlBody || null
    const jsonHeaders = payload.Headers ?? []
    const rawHeaders = parseRawEmailHeaders(payload.RawEmail)
    const headers = mergeHeaders(jsonHeaders, rawHeaders)
    if (rawHeaders.length > 0) {
        logger.info(
            "[postmark-webhook] Supplemented JSON headers with raw email headers",
            {
                jsonHeaderCount: jsonHeaders.length,
                rawHeaderCount: rawHeaders.length
            }
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

    const appUrl = site.publicUrl

    // Check if this is a reply to an existing thread
    const existingThread = await detectExistingThread(
        headers,
        subject,
        fromEmail
    )

    if (existingThread) {
        if (existingThread.type === "email") {
            // Fetch assignee before inserting so we have it for notification
            const [ticket] = await db
                .select({
                    assigned_to: inboundEmails.assigned_to,
                    status: inboundEmails.status
                })
                .from(inboundEmails)
                .where(eq(inboundEmails.id, existingThread.id))
                .limit(1)

            const received = await insertUnlessRedelivered(async () => {
                const [row] = await db
                    .insert(inboundEmailReceived)
                    .values({
                        email_id: existingThread.id,
                        from_address: fromEmail,
                        from_name: fromName,
                        subject,
                        body_text: bodyText,
                        body_html: bodyHtml,
                        postmark_message_id: messageId
                    })
                    .returning({ id: inboundEmailReceived.id })
                return row
            })
            if (!received) {
                logger.info(
                    "[postmark-webhook] Ignored concurrent redelivery",
                    { threadType: "email", ticketId: existingThread.id }
                )
                return
            }
            await storeInboundAttachments({
                parentType: "email_received",
                parentId: received.id,
                messageId,
                attachments: payload.Attachments
            })

            // A reply to a closed thread reopens it so it resurfaces in the
            // Active tab. Spam threads stay spam — junk must not resurrect
            // its own ticket by replying.
            if (ticket?.status === "closed") {
                await db
                    .update(inboundEmails)
                    .set({ status: "active", updated_at: new Date() })
                    .where(eq(inboundEmails.id, existingThread.id))
                logger.info(
                    "[postmark-webhook] Reopened closed email thread on reply",
                    { ticketId: existingThread.id }
                )
            }

            await notifyQuietly(
                () =>
                    notifyAssignee({
                        assignedTo: ticket?.assigned_to ?? null,
                        appUrl,
                        ticketType: "email",
                        ticketId: existingThread.id,
                        message: { fromName, fromAddress: fromEmail, subject }
                    }),
                "assignee"
            )

            logger.info("[postmark-webhook] Routed reply to email thread", {
                threadType: "email",
                ticketId: existingThread.id
            })
        } else {
            const [ticket] = await db
                .select({
                    assigned_to: concerns.assigned_to,
                    status: concerns.status
                })
                .from(concerns)
                .where(eq(concerns.id, existingThread.id))
                .limit(1)

            const received = await insertUnlessRedelivered(async () => {
                const [row] = await db
                    .insert(concernReceived)
                    .values({
                        concern_id: existingThread.id,
                        from_address: fromEmail,
                        from_name: fromName,
                        subject,
                        body_text: bodyText,
                        body_html: bodyHtml,
                        postmark_message_id: messageId
                    })
                    .returning({ id: concernReceived.id })
                return row
            })
            if (!received) {
                logger.info(
                    "[postmark-webhook] Ignored concurrent redelivery",
                    { threadType: "concern", ticketId: existingThread.id }
                )
                return
            }
            await storeInboundAttachments({
                parentType: "concern_received",
                parentId: received.id,
                messageId,
                attachments: payload.Attachments
            })

            if (ticket?.status === "closed") {
                await db
                    .update(concerns)
                    .set({ status: "active", updated_at: new Date() })
                    .where(eq(concerns.id, existingThread.id))
                logger.info(
                    "[postmark-webhook] Reopened closed concern thread on reply",
                    { ticketId: existingThread.id }
                )
            }

            await notifyQuietly(
                () =>
                    notifyAssignee({
                        assignedTo: ticket?.assigned_to ?? null,
                        appUrl,
                        ticketType: "concern",
                        ticketId: existingThread.id
                    }),
                "assignee"
            )

            logger.info("[postmark-webhook] Routed reply to concern thread", {
                threadType: "concern",
                ticketId: existingThread.id
            })
        }
        return
    }

    if (isConcern) {
        const createdConcern = await insertUnlessRedelivered(async () => {
            const [row] = await db
                .insert(concerns)
                .values({
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
                .returning({ id: concerns.id })
            return row
        })
        if (!createdConcern) {
            logger.info("[postmark-webhook] Ignored concurrent redelivery", {
                threadType: "concern"
            })
            return
        }
        await storeInboundAttachments({
            parentType: "concern",
            parentId: createdConcern.id,
            messageId,
            attachments: payload.Attachments
        })
        await notifyQuietly(() => notifyOmbudsmen(appUrl), "ombudsmen")
    } else {
        const created = await insertUnlessRedelivered(async () => {
            const [row] = await db
                .insert(inboundEmails)
                .values({
                    email_id: messageId,
                    from_address: fromEmail,
                    from_name: fromName,
                    to_address: toAddresses[0] || payload.To,
                    subject,
                    body_text: bodyText,
                    body_html: bodyHtml,
                    status: "new"
                })
                .returning({ id: inboundEmails.id })
            return row
        })
        if (!created) {
            logger.info("[postmark-webhook] Ignored concurrent redelivery", {
                threadType: "email"
            })
            return
        }
        await storeInboundAttachments({
            parentType: "email",
            parentId: created.id,
            messageId,
            attachments: payload.Attachments
        })
        await notifyQuietly(
            () =>
                notifyAdmins({
                    appUrl,
                    ticketId: created.id,
                    message: { fromName, fromAddress: fromEmail, subject }
                }),
            "admins"
        )
    }
}

// ---------------------------------------------------------------------------
// Subscription change handling
// ---------------------------------------------------------------------------

/**
 * Record an email-status change driven by Postmark.
 *
 * The actor is an external system, but audit_log keys on a user, so the entry
 * is attributed to the affected player with the origin named in the summary.
 * Addresses with no matching account get no entry — the suppression row is the
 * only record that exists for those.
 */
async function logEmailStatusChange(email: string, summary: string) {
    const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
    if (!user) return
    await logAuditEntry({
        userId: user.id,
        action: "update_email_status",
        entityType: "users",
        entityId: user.id,
        summary
    })
}

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
        const downgraded = await db
            .update(users)
            .set({ email_status: "unsubscribed" })
            .where(and(eq(users.email, email), eq(users.email_status, "valid")))
            .returning({ id: users.id })
        if (downgraded.length > 0) {
            await logEmailStatusChange(
                email,
                `Email status set to "unsubscribed" by Postmark subscription change (stream ${streamId}, reason ${payload.SuppressionReason ?? "ManualSuppression"}, origin ${payload.Origin ?? "Recipient"})`
            )
        }
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

        // Re-derive email_status from whatever suppressions remain
        const recomputed = await recomputeEmailStatus(email)
        if (recomputed.changed) {
            await logEmailStatusChange(
                email,
                `Email status set to "${recomputed.status}" after Postmark removed the ${streamId} suppression`
            )
        }
    }

    logger.info("[postmark-webhook] Subscription change", {
        maskedEmail: maskEmail(email),
        stream: streamId,
        suppressed: payload.SuppressSending
    })
}

// ---------------------------------------------------------------------------
// Bounce handling
// ---------------------------------------------------------------------------

async function handleBounce(payload: PostmarkBouncePayload) {
    const email = payload.Email?.toLowerCase()
    const streamId = payload.MessageStream
    if (!email) return

    const isHardBounce = payload.Type === "HardBounce"

    // Temporary failures (SoftBounce, Transient, and notably Gmail's
    // rate-limiting SpamNotification) must not create a suppression row —
    // filterSuppressed() treats any row as permanent, so recording one here
    // silently removes a valid recipient from every future broadcast. Postmark
    // retains the full bounce history for diagnostics either way.
    if (!isPermanentBounceType(payload.Type)) {
        logger.info("[postmark-webhook] Transient bounce (not suppressing)", {
            maskedEmail: maskEmail(email),
            bounceType: payload.Type,
            stream: streamId
        })
        return
    }

    // Record suppression for permanent bounce types only
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

    // Only hard bounces mark the address itself dead; a SpamComplaint reaching
    // this point gets its email_status from the dedicated SpamComplaint webhook.
    if (isHardBounce) {
        const marked = await db
            .update(users)
            .set({ email_status: "bounced" })
            .where(eq(users.email, email))
            .returning({ id: users.id })
        if (marked.length > 0) {
            await logEmailStatusChange(
                email,
                `Email status set to "bounced" by Postmark hard bounce (stream ${streamId}, type ${payload.Type})`
            )
        }
    }

    logger.info("[postmark-webhook] Bounce", {
        maskedEmail: maskEmail(email),
        bounceType: payload.Type,
        stream: streamId
    })
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
    const fromValid = await db
        .update(users)
        .set({ email_status: "spam_complaint" })
        .where(and(eq(users.email, email), eq(users.email_status, "valid")))
        .returning({ id: users.id })
    const fromUnsubscribed = await db
        .update(users)
        .set({ email_status: "spam_complaint" })
        .where(
            and(eq(users.email, email), eq(users.email_status, "unsubscribed"))
        )
        .returning({ id: users.id })
    if (fromValid.length > 0 || fromUnsubscribed.length > 0) {
        await logEmailStatusChange(
            email,
            `Email status set to "spam_complaint" by Postmark spam complaint (stream ${streamId ?? "outbound"})`
        )
    }

    logger.info("[postmark-webhook] Spam complaint", {
        maskedEmail: maskEmail(email),
        stream: streamId
    })
}

// ---------------------------------------------------------------------------
// Webhook token verification
// ---------------------------------------------------------------------------

function verifyWebhookAuth(request: NextRequest): boolean {
    const user = process.env.POSTMARK_WEBHOOK_USER
    const password = process.env.POSTMARK_WEBHOOK_PASSWORD
    if (!user || !password) {
        logger.error(
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
// Dispatch
// ---------------------------------------------------------------------------

/** Route a Postmark payload — inline or spooled — to its handler. */
async function dispatchPostmarkPayload(payload: Record<string, unknown>) {
    // Postmark uses RecordType to distinguish webhook types
    if (payload.RecordType === "SubscriptionChange") {
        await handleSubscriptionChange(
            postmarkSubscriptionChangeSchema.parse(payload)
        )
        return
    }

    if (payload.RecordType === "Bounce") {
        await handleBounce(postmarkBounceSchema.parse(payload))
        return
    }

    if (payload.RecordType === "SpamComplaint") {
        await handleSpamComplaint(postmarkSpamComplaintSchema.parse(payload))
        return
    }

    // Inbound emails have no RecordType but have MessageID + From + To
    if (payload.MessageID && payload.From && !payload.RecordType) {
        await handleInboundEmail(postmarkInboundSchema.parse(payload))
        return
    }

    // Other webhook types (bounces, opens, etc.) — acknowledge but ignore
    logger.info("[postmark-webhook] Unhandled RecordType", {
        recordType: payload.RecordType ?? "unknown"
    })
}

/**
 * Process an inbound message the Worker spooled to R2. A 400 makes Postmark
 * retry through the Worker, which spools a fresh copy under a new key, so
 * the object is deleted only after success; failures leave it for the
 * bucket's lifecycle rule (and for debugging).
 */
async function handleSpooledInbound(
    payload: Record<string, unknown>
): Promise<NextResponse> {
    const envelope = parseSpooledEnvelope(payload)
    if (!envelope) {
        logger.warn("[postmark-webhook] Rejected malformed spool envelope", {
            spoolKey: String(payload.SpoolKey ?? "")
        })
        return NextResponse.json({ error: "Bad envelope" }, { status: 400 })
    }
    const { SpoolKey: spoolKey, ContentLength: contentLength } = envelope

    const object = await getR2Object(spoolKey)
    if (!object) {
        logger.error("[postmark-webhook] Spool object missing", { spoolKey })
        return NextResponse.json({ error: "Spool missing" }, { status: 400 })
    }
    if (
        object.contentLength !== null &&
        object.contentLength !== contentLength
    ) {
        logger.error("[postmark-webhook] Spool object length mismatch", {
            spoolKey,
            expected: contentLength,
            actual: object.contentLength
        })
        return NextResponse.json({ error: "Spool truncated" }, { status: 400 })
    }

    let inner: unknown
    try {
        inner = await new Response(object.body).json()
    } catch {
        logger.error("[postmark-webhook] Spool object is not JSON", {
            spoolKey
        })
        return NextResponse.json({ error: "Spool unreadable" }, { status: 400 })
    }
    if (typeof inner !== "object" || inner === null) {
        logger.error("[postmark-webhook] Spool object is not a JSON object", {
            spoolKey
        })
        return NextResponse.json({ error: "Spool unreadable" }, { status: 400 })
    }

    try {
        await dispatchPostmarkPayload(inner as Record<string, unknown>)
    } catch (error) {
        logger.error("[postmark-webhook] Spooled message failed", {
            spoolKey,
            error: error instanceof Error ? error.message : String(error)
        })
        throw error
    }

    try {
        await deleteR2Object(spoolKey)
    } catch (error) {
        // Lifecycle expiry cleans it up; never fail a processed message here.
        logger.warn("[postmark-webhook] Could not delete spool object", {
            spoolKey,
            error: error instanceof Error ? error.message : String(error)
        })
    }
    logger.info("[postmark-webhook] Processed spooled message", {
        spoolKey,
        contentLength
    })
    return NextResponse.json({ received: true })
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    if (!verifyWebhookAuth(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const payload = (await request.json()) as Record<string, unknown>

        if (payload.RecordType === "BSDSpooledInbound") {
            return await handleSpooledInbound(payload)
        }

        await dispatchPostmarkPayload(payload)
        return NextResponse.json({ received: true })
    } catch (error) {
        logger.error(
            "[postmark-webhook] Webhook processing failed",
            undefined,
            error
        )
        return NextResponse.json(
            { error: "Webhook processing failed" },
            { status: 400 }
        )
    }
}
