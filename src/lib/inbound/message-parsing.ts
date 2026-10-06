/**
 * Pure parsing of an inbound Postmark message: sender, headers, and the
 * thread references a reply may carry. Nothing here touches the database;
 * thread-detection.ts decides what the references are worth.
 */
import type {
    PostmarkHeader,
    PostmarkInboundPayload
} from "./postmark-payloads"

export type ThreadRef =
    | { type: "email"; id: number }
    | { type: "concern"; id: number }

/** The fields of an inbound message that are stored on a ticket or reply. */
export interface InboundMessage {
    messageId: string
    fromEmail: string
    fromName: string | null
    subject: string
    bodyText: string | null
    bodyHtml: string | null
    attachments: PostmarkInboundPayload["Attachments"]
}

/**
 * Read the stored fields off a parsed Postmark payload, with the fallbacks
 * for a bare From header, blank display names and a missing subject/body.
 */
export function readInboundMessage(
    payload: PostmarkInboundPayload
): InboundMessage {
    const fromEmail =
        payload.FromFull?.Email ?? parseFromAddress(payload.From).email
    // Postmark sends the display name both in FromFull and as FromName; either
    // may be an empty string for a bare address, so treat blanks as missing.
    const fromName =
        payload.FromFull?.Name ||
        payload.FromName ||
        parseFromAddress(payload.From).name
    return {
        messageId: payload.MessageID,
        fromEmail,
        fromName,
        subject: payload.Subject || "(No subject)",
        bodyText: payload.TextBody || null,
        bodyHtml: payload.HtmlBody || null,
        attachments: payload.Attachments
    }
}

export function parseFromAddress(from: string): {
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

export function getHeader(
    headers: PostmarkHeader[],
    name: string
): string | null {
    const lower = name.toLowerCase()
    return headers.find((h) => h.Name.toLowerCase() === lower)?.Value ?? null
}

/**
 * Parse a list of Message-IDs from an In-Reply-To or References header.
 * Returns cleaned IDs with angle brackets stripped.
 */
export function parseMessageIds(header: string | null): string[] {
    if (!header) return []
    return header
        .split(/\s+/)
        .map((s) => s.replace(/^<|>$/g, "").trim())
        .filter(Boolean)
}

/**
 * Postmark's sendEmail API returns MessageID as just the GUID portion
 * (e.g. "abc123"), but the actual Message-ID email header is
 * "abc123@smtp.postmarkapp.com". Normalise by also including the
 * local-part (before "@") of every incoming ID so we match the stored
 * GUID regardless of any domain suffix the email client may include.
 */
export function expandMessageIds(rawMessageIds: string[]): string[] {
    return [
        ...new Set([
            ...rawMessageIds,
            ...rawMessageIds.map((id) => {
                const atIdx = id.indexOf("@")
                return atIdx > 0 ? id.substring(0, atIdx) : id
            })
        ])
    ]
}

/**
 * Decode Postmark's base64-encoded RawEmail and return its headers as a
 * PostmarkHeader array. Handles RFC 2822 folded header lines (continuation
 * lines that start with whitespace). Returns an empty array if RawEmail is
 * absent or unparseable.
 */
export function parseRawEmailHeaders(
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
export function mergeHeaders(
    jsonHeaders: PostmarkHeader[],
    rawHeaders: PostmarkHeader[]
): PostmarkHeader[] {
    const existing = new Set(jsonHeaders.map((h) => h.Name.toLowerCase()))
    const extra = rawHeaders.filter((h) => !existing.has(h.Name.toLowerCase()))
    return [...jsonHeaders, ...extra]
}

/**
 * The thread an X-BSD-Ticket-ID header names ("email-7", "concern-12"), or
 * null. A claim only: the id is guessable, so the caller must still check
 * the sender took part in the thread.
 */
export function parseTicketIdHeader(value: string): ThreadRef | null {
    const emailMatch = value.match(/^email-(\d+)$/)
    if (emailMatch) return { type: "email", id: parseInt(emailMatch[1], 10) }
    const concernMatch = value.match(/^concern-(\d+)$/)
    if (concernMatch) {
        return { type: "concern", id: parseInt(concernMatch[1], 10) }
    }
    return null
}

/**
 * The threads a subject line names, concern first. Relies on our reply
 * subjects including the ticket ID:
 *   concerns → "Re: Concern #17"
 *   emails   → "Re: Email #7: ..."
 * Like the header, these are claims the caller must verify.
 */
export function parseSubjectThreadRefs(subject: string): ThreadRef[] {
    const refs: ThreadRef[] = []
    const concernSubjectMatch = subject.match(/concern\s*#\s*(\d+)/i)
    if (concernSubjectMatch) {
        refs.push({ type: "concern", id: parseInt(concernSubjectMatch[1], 10) })
    }
    const emailSubjectMatch = subject.match(/\bemail\s*#\s*(\d+)\b/i)
    if (emailSubjectMatch) {
        refs.push({ type: "email", id: parseInt(emailSubjectMatch[1], 10) })
    }
    return refs
}

/**
 * Was the message addressed to `address` (already lowercased)? Checks the
 * parsed recipient list and, as a fallback, the raw To header. An empty
 * address never matches, so an unset inbox routes nothing.
 */
export function isAddressedTo(
    address: string,
    toAddresses: string[],
    toRaw: string
): boolean {
    if (!address) return false
    return (
        toAddresses.includes(address) || toRaw.toLowerCase().includes(address)
    )
}
