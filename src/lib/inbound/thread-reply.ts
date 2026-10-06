import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    concernReceived,
    concerns,
    inboundEmailReceived,
    inboundEmails
} from "@/database/schema"
import { storeInboundAttachments } from "@/lib/email-attachments"
import { logger } from "@/lib/logger"
import type { InboundMessage } from "./message-parsing"
import { notifyAssignee, notifyQuietly } from "./notifications"
import { insertUnlessRedelivered } from "./redelivery"

/**
 * Append an inbound message to an existing admin-email thread, reopen the
 * thread if it was closed, and nudge its assignee.
 */
export async function appendEmailThreadReply(
    ticketId: number,
    message: InboundMessage,
    appUrl: string
) {
    const { messageId, fromEmail, fromName, subject } = message

    // Fetch assignee before inserting so we have it for notification
    const [ticket] = await db
        .select({
            assigned_to: inboundEmails.assigned_to,
            status: inboundEmails.status
        })
        .from(inboundEmails)
        .where(eq(inboundEmails.id, ticketId))
        .limit(1)

    const received = await insertUnlessRedelivered(async () => {
        const [row] = await db
            .insert(inboundEmailReceived)
            .values({
                email_id: ticketId,
                from_address: fromEmail,
                from_name: fromName,
                subject,
                body_text: message.bodyText,
                body_html: message.bodyHtml,
                postmark_message_id: messageId
            })
            .returning({ id: inboundEmailReceived.id })
        return row
    })
    if (!received) {
        logger.info("[postmark-webhook] Ignored concurrent redelivery", {
            threadType: "email",
            ticketId
        })
        return
    }
    await storeInboundAttachments({
        parentType: "email_received",
        parentId: received.id,
        messageId,
        attachments: message.attachments
    })

    // A reply to a closed thread reopens it so it resurfaces in the
    // Active tab. Spam threads stay spam — junk must not resurrect
    // its own ticket by replying.
    if (ticket?.status === "closed") {
        await db
            .update(inboundEmails)
            .set({ status: "active", updated_at: new Date() })
            .where(eq(inboundEmails.id, ticketId))
        logger.info(
            "[postmark-webhook] Reopened closed email thread on reply",
            { ticketId }
        )
    }

    await notifyQuietly(
        () =>
            notifyAssignee({
                assignedTo: ticket?.assigned_to ?? null,
                appUrl,
                ticketType: "email",
                ticketId,
                message: { fromName, fromAddress: fromEmail, subject }
            }),
        "assignee"
    )

    logger.info("[postmark-webhook] Routed reply to email thread", {
        threadType: "email",
        ticketId
    })
}

/**
 * Append an inbound message to an existing concern thread, reopen the
 * concern if it was closed, and nudge its assignee (without content).
 */
export async function appendConcernThreadReply(
    ticketId: number,
    message: InboundMessage,
    appUrl: string
) {
    const { messageId } = message

    const [ticket] = await db
        .select({
            assigned_to: concerns.assigned_to,
            status: concerns.status
        })
        .from(concerns)
        .where(eq(concerns.id, ticketId))
        .limit(1)

    const received = await insertUnlessRedelivered(async () => {
        const [row] = await db
            .insert(concernReceived)
            .values({
                concern_id: ticketId,
                from_address: message.fromEmail,
                from_name: message.fromName,
                subject: message.subject,
                body_text: message.bodyText,
                body_html: message.bodyHtml,
                postmark_message_id: messageId
            })
            .returning({ id: concernReceived.id })
        return row
    })
    if (!received) {
        logger.info("[postmark-webhook] Ignored concurrent redelivery", {
            threadType: "concern",
            ticketId
        })
        return
    }
    await storeInboundAttachments({
        parentType: "concern_received",
        parentId: received.id,
        messageId,
        attachments: message.attachments
    })

    if (ticket?.status === "closed") {
        await db
            .update(concerns)
            .set({ status: "active", updated_at: new Date() })
            .where(eq(concerns.id, ticketId))
        logger.info(
            "[postmark-webhook] Reopened closed concern thread on reply",
            { ticketId }
        )
    }

    await notifyQuietly(
        () =>
            notifyAssignee({
                assignedTo: ticket?.assigned_to ?? null,
                appUrl,
                ticketType: "concern",
                ticketId
            }),
        "assignee"
    )

    logger.info("[postmark-webhook] Routed reply to concern thread", {
        threadType: "concern",
        ticketId
    })
}
