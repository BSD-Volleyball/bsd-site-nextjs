import "server-only"
import { db } from "@/database/db"
import { concerns, inboundEmails } from "@/database/schema"
import { storeInboundAttachments } from "@/lib/email-attachments"
import { logger } from "@/lib/logger"
import type { InboundMessage } from "./message-parsing"
import { notifyAdmins, notifyOmbudsmen, notifyQuietly } from "./notifications"
import { insertUnlessRedelivered } from "./redelivery"

/** Open a new concern from mail sent to the concern inbox. */
export async function createConcernFromEmail(
    message: InboundMessage,
    appUrl: string
) {
    const { messageId, bodyText, bodyHtml } = message
    const createdConcern = await insertUnlessRedelivered(async () => {
        const [row] = await db
            .insert(concerns)
            .values({
                user_id: null,
                anonymous: false,
                contact_name: message.fromName,
                contact_email: message.fromEmail,
                contact_phone: null,
                want_followup: false,
                incident_date: new Date().toISOString().split("T")[0],
                location: "Submitted via email",
                person_involved: message.subject,
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
        attachments: message.attachments
    })
    await notifyQuietly(() => notifyOmbudsmen(appUrl), "ombudsmen")
}

/** Open a new admin email ticket (Manage Emails) from any other inbound mail. */
export async function createEmailTicket(
    message: InboundMessage,
    toAddress: string,
    appUrl: string
) {
    const { messageId, fromEmail, fromName, subject } = message
    const created = await insertUnlessRedelivered(async () => {
        const [row] = await db
            .insert(inboundEmails)
            .values({
                email_id: messageId,
                from_address: fromEmail,
                from_name: fromName,
                to_address: toAddress,
                subject,
                body_text: message.bodyText,
                body_html: message.bodyHtml,
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
        attachments: message.attachments
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
