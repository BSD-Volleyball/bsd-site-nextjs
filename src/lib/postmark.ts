import "server-only"
import { ServerClient } from "postmark"
import { logger } from "@/lib/logger"

// ---------------------------------------------------------------------------
// Postmark Message Stream IDs
// ---------------------------------------------------------------------------

export const STREAM_OUTBOUND = "outbound"
export const STREAM_AUTOMATED_REMINDERS = "automated-reminders"
export const STREAM_BROADCAST = "broadcast"
export const STREAM_IN_SEASON_UPDATES = "in-season-updates"

export type MessageStream =
    | typeof STREAM_OUTBOUND
    | typeof STREAM_AUTOMATED_REMINDERS
    | typeof STREAM_BROADCAST
    | typeof STREAM_IN_SEASON_UPDATES

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let _client: ServerClient | null = null

function getPostmarkClient(): ServerClient {
    if (!_client) {
        const token = process.env.POSTMARK_SERVER_TOKEN
        if (!token) {
            throw new Error(
                "POSTMARK_SERVER_TOKEN is not set in environment variables"
            )
        }
        _client = new ServerClient(token)
    }
    return _client
}

// ---------------------------------------------------------------------------
// Transactional email (single)
// ---------------------------------------------------------------------------

export interface SendEmailOptions {
    from: string
    fromName?: string
    to: string
    subject: string
    htmlBody: string
    textBody?: string
    stream?: MessageStream
    tag?: string
    replyTo?: string
    inReplyTo?: string
    headers?: Array<{ name: string; value: string }>
    attachments?: Array<{
        name: string
        content: string // base64
        contentType: string
        contentId?: string
    }>
}

export async function sendEmail(opts: SendEmailOptions): Promise<string> {
    const client = getPostmarkClient()
    const result = await client.sendEmail({
        From: opts.fromName ? `${opts.fromName} <${opts.from}>` : opts.from,
        To: opts.to,
        Subject: opts.subject,
        HtmlBody: opts.htmlBody,
        TextBody: opts.textBody,
        MessageStream: opts.stream ?? STREAM_OUTBOUND,
        Tag: opts.tag,
        ReplyTo: opts.replyTo,
        Headers: [
            ...(opts.inReplyTo
                ? [{ Name: "In-Reply-To", Value: opts.inReplyTo }]
                : []),
            ...(opts.headers?.map((h) => ({ Name: h.name, Value: h.value })) ??
                [])
        ],
        Attachments: opts.attachments?.map((a) => ({
            Name: a.name,
            Content: a.content,
            ContentType: a.contentType,
            ContentID: a.contentId ?? null
        }))
    })
    return result.MessageID
}

// ---------------------------------------------------------------------------
// Bounce classification
// ---------------------------------------------------------------------------

/**
 * Postmark bounce types that permanently disable a recipient.
 *
 * Mirrors Postmark's own deactivation behaviour: only hard bounces and spam
 * complaints mean "never contact this address again". Every other type
 * describes a temporary condition at the receiving end.
 *
 * The distinction is not academic. Gmail reports its transient
 * "500 4.7.28 ... temporarily rate limited" throttle as bounce type
 * SpamNotification, and treating that as permanent silently disabled 724 valid
 * gmail.com recipients after the 2026-07-01 broadcast.
 */
const PERMANENT_BOUNCE_TYPES = new Set(["HardBounce", "SpamComplaint"])

export function isPermanentBounceType(
    type: string | null | undefined
): boolean {
    return type ? PERMANENT_BOUNCE_TYPES.has(type) : false
}

// ---------------------------------------------------------------------------
// Batch email (up to 500 per call, paced to protect domain reputation)
// ---------------------------------------------------------------------------

export interface BatchEmailMessage {
    from: string
    to: string
    subject: string
    htmlBody: string
    textBody?: string
    stream?: MessageStream
    tag?: string
    replyTo?: string
    headers?: Array<{ name: string; value: string }>
}

export interface BatchSendResult {
    sent: number
    failed: number
    /** Per-message outcome in submission order; errorCode 0 means accepted. */
    results: Array<{ to: string; messageId: string | null; errorCode: number }>
}

export interface BatchThrottleOptions {
    /** Recipients per Postmark call. Clamped to Postmark's 500 maximum. */
    batchSize?: number
    /** Pause inserted between chunks. Not applied after the final chunk. */
    delayMs?: number
}

/** Postmark rejects any batch call carrying more than 500 messages. */
const MAX_POSTMARK_BATCH = 500

/**
 * Deliberately smaller than Postmark's ceiling. Submitting 1,600 messages as
 * four back-to-back 500-message calls is what tripped Gmail's per-domain rate
 * limiter; pacing the submission paces Postmark's delivery.
 */
const DEFAULT_BATCH_SIZE = 100
const DEFAULT_BATCH_DELAY_MS = 2000

function positiveIntOr(value: unknown, fallback: number): number {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function resolveBatchThrottle(opts?: BatchThrottleOptions): {
    batchSize: number
    delayMs: number
} {
    const batchSize = Math.min(
        positiveIntOr(
            opts?.batchSize ?? process.env.EMAIL_BATCH_SIZE,
            DEFAULT_BATCH_SIZE
        ),
        MAX_POSTMARK_BATCH
    )

    // Zero is a legitimate caller choice ("no pacing"), so it must survive the
    // fallback that positiveIntOr applies; only negatives collapse to zero.
    const rawDelay = opts?.delayMs ?? process.env.EMAIL_BATCH_DELAY_MS
    const parsedDelay = Number(rawDelay)
    const delayMs =
        rawDelay === undefined || !Number.isFinite(parsedDelay)
            ? DEFAULT_BATCH_DELAY_MS
            : Math.max(0, Math.floor(parsedDelay))

    return { batchSize, delayMs }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function sendBatchEmails(
    messages: BatchEmailMessage[],
    throttle?: BatchThrottleOptions
): Promise<BatchSendResult> {
    const client = getPostmarkClient()
    const { batchSize, delayMs } = resolveBatchThrottle(throttle)
    let sent = 0
    let failed = 0
    const perMessage: BatchSendResult["results"] = []

    for (let i = 0; i < messages.length; i += batchSize) {
        const chunk = messages.slice(i, i + batchSize)
        const results = await client.sendEmailBatch(
            chunk.map((m) => ({
                From: m.from,
                To: m.to,
                Subject: m.subject,
                HtmlBody: m.htmlBody,
                TextBody: m.textBody,
                MessageStream: m.stream ?? STREAM_OUTBOUND,
                Tag: m.tag,
                ReplyTo: m.replyTo,
                Headers: m.headers?.map((h) => ({
                    Name: h.name,
                    Value: h.value
                }))
            }))
        )
        for (let j = 0; j < results.length; j++) {
            const r = results[j]
            // Postmark omits To on some error responses; fall back to the
            // submitted address so callers can always correlate outcomes.
            perMessage.push({
                to: r.To ?? chunk[j]?.to ?? "",
                messageId: r.ErrorCode === 0 ? (r.MessageID ?? null) : null,
                errorCode: r.ErrorCode
            })
            if (r.ErrorCode === 0) {
                sent++
            } else {
                failed++
                logger.error("[postmark] Batch send error", {
                    to: r.To,
                    errorCode: r.ErrorCode,
                    postmarkMessage: r.Message
                })
            }
        }

        // Pace only between chunks; a trailing sleep would stall the caller
        // (and burn Vercel function time) after the last message is away.
        const hasMore = i + batchSize < messages.length
        if (hasMore && delayMs > 0) await sleep(delayMs)
    }

    return { sent, failed, results: perMessage }
}

// ---------------------------------------------------------------------------
// Suppression management (Postmark REST API)
// ---------------------------------------------------------------------------

/**
 * Pushes a stream-level suppression to Postmark, mirroring what happens when
 * a recipient clicks Postmark's own unsubscribe link. Callers must also
 * upsert the local email_suppressions row — the SubscriptionChange webhook
 * echo is idempotent either way.
 */
export async function createStreamSuppression(
    streamId: MessageStream,
    email: string
): Promise<void> {
    const client = getPostmarkClient()
    await client.createSuppressions(streamId, {
        Suppressions: [{ EmailAddress: email }]
    })
}

/**
 * Deletes a stream-level suppression at Postmark. Postmark refuses to delete
 * SpamComplaint suppressions — callers must check canReactivate first.
 */
export async function deleteStreamSuppression(
    streamId: MessageStream,
    email: string
): Promise<void> {
    const client = getPostmarkClient()
    await client.deleteSuppressions(streamId, {
        Suppressions: [{ EmailAddress: email }]
    })
}

// ---------------------------------------------------------------------------
// Broadcast email — sends individually via batch API to a list of recipients.
// Uses the appropriate broadcast stream and includes unsubscribe placeholder.
// ---------------------------------------------------------------------------

export interface BroadcastOptions {
    from: string
    subject: string
    htmlBody: string
    textBody?: string
    recipients: Array<{ email: string }>
    stream: typeof STREAM_BROADCAST | typeof STREAM_IN_SEASON_UPDATES
    tag?: string
}

export async function sendBroadcastEmails(
    opts: BroadcastOptions
): Promise<{ sent: number; failed: number }> {
    const messages: BatchEmailMessage[] = opts.recipients.map((r) => ({
        from: opts.from,
        to: r.email,
        subject: opts.subject,
        htmlBody: opts.htmlBody,
        textBody: opts.textBody,
        stream: opts.stream,
        tag: opts.tag
    }))

    return sendBatchEmails(messages)
}
