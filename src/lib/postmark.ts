import "server-only"
import { ServerClient } from "postmark"

// ---------------------------------------------------------------------------
// Postmark Message Stream IDs
// ---------------------------------------------------------------------------

export const STREAM_OUTBOUND = "outbound"
export const STREAM_AUTOMATED_REMINDERS = "automated-reminders"
export const STREAM_INBOUND = "inbound"
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

export function getPostmarkClient(): ServerClient {
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
        From: opts.from,
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
// Batch email (up to 500 per call)
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
}

export async function sendBatchEmails(
    messages: BatchEmailMessage[]
): Promise<{ sent: number; failed: number }> {
    const client = getPostmarkClient()
    let sent = 0
    let failed = 0

    // Postmark accepts max 500 per batch call
    const BATCH_SIZE = 500
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const chunk = messages.slice(i, i + BATCH_SIZE)
        const results = await client.sendEmailBatch(
            chunk.map((m) => ({
                From: m.from,
                To: m.to,
                Subject: m.subject,
                HtmlBody: m.htmlBody,
                TextBody: m.textBody,
                MessageStream: m.stream ?? STREAM_OUTBOUND,
                Tag: m.tag,
                ReplyTo: m.replyTo
            }))
        )
        for (const r of results) {
            if (r.ErrorCode === 0) {
                sent++
            } else {
                failed++
                console.error(
                    `[postmark] Batch send error for ${r.To}: ${r.Message}`
                )
            }
        }
    }

    return { sent, failed }
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
