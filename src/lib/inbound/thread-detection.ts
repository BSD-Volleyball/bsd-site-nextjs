import "server-only"
import { eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import {
    concernReceived,
    concernReplies,
    concerns,
    inboundEmailReceived,
    inboundEmailReplies,
    inboundEmails,
    users
} from "@/database/schema"
import { logger } from "@/lib/logger"
import {
    expandMessageIds,
    getHeader,
    parseMessageIds,
    parseSubjectThreadRefs,
    parseTicketIdHeader,
    type ThreadRef
} from "./message-parsing"
import type { PostmarkHeader } from "./postmark-payloads"

/**
 * Has this address already taken part in the thread? A ticket id in a header
 * or subject is guessable (ids are sequential), so a match on it only counts
 * when the sender is the original sender/reporter or has written into the
 * thread before. Otherwise anyone could append mail to, and reopen, any
 * concern by sending "Re: Concern #12". Message-ID matches need no such check:
 * those ids are ones we issued and cannot be guessed.
 */
export async function senderOnThread(
    thread: ThreadRef,
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

/** Does the ticket a subject line names exist at all? */
async function ticketExists(ref: ThreadRef): Promise<boolean> {
    if (ref.type === "concern") {
        const [ticket] = await db
            .select({ id: concerns.id })
            .from(concerns)
            .where(eq(concerns.id, ref.id))
            .limit(1)
        return Boolean(ticket)
    }
    const [ticket] = await db
        .select({ id: inboundEmails.id })
        .from(inboundEmails)
        .where(eq(inboundEmails.id, ref.id))
        .limit(1)
    return Boolean(ticket)
}

/**
 * Returns the matched ticket if this inbound email is a reply to an existing
 * admin-email thread or concern thread. Checks (in order):
 *   1. X-BSD-Ticket-ID custom header
 *   2. In-Reply-To / References against stored postmark_message_ids and
 *      original ticket email IDs
 *   3. Subject-based detection (fallback when headers are stripped by relays)
 */
export async function detectExistingThread(
    headers: PostmarkHeader[],
    subject: string | undefined,
    senderEmail: string
): Promise<ThreadRef | null> {
    // Header and subject matches are only trusted from a thread participant.
    const fromParticipant = async (thread: ThreadRef, via: string) => {
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
        const ref = parseTicketIdHeader(ticketId)
        if (ref) {
            const thread = await fromParticipant(ref, "X-BSD-Ticket-ID")
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
        const messageIds = expandMessageIds(rawMessageIds)

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
    if (subject) {
        for (const ref of parseSubjectThreadRefs(subject)) {
            if (await ticketExists(ref)) {
                const thread = await fromParticipant(ref, "subject")
                if (thread) return thread
            }
        }
    }

    logger.info("[postmark-webhook] No existing thread found", {
        subjectLength: subject?.length ?? 0
    })
    return null
}
