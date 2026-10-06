import "server-only"
import { site } from "@/config/site"
import {
    listAttachmentsFor,
    storeInboundAttachments
} from "@/lib/email-attachments"
import { logger } from "@/lib/logger"
import {
    isAddressedTo,
    mergeHeaders,
    parseRawEmailHeaders,
    readInboundMessage
} from "./message-parsing"
import { createConcernFromEmail, createEmailTicket } from "./new-ticket"
import type { PostmarkInboundPayload } from "./postmark-payloads"
import { findRecordedMessage } from "./redelivery"
import { detectExistingThread } from "./thread-detection"
import {
    appendConcernThreadReply,
    appendEmailThreadReply
} from "./thread-reply"

/**
 * Handle one inbound message: ignore a redelivery, otherwise append it to
 * the thread it replies to, or open a new concern or email ticket.
 */
export async function handleInboundEmail(payload: PostmarkInboundPayload) {
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
    const message = readInboundMessage(payload)
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

    const isConcern = isAddressedTo(concernAddress, toAddresses, payload.To)

    const appUrl = site.publicUrl

    // Check if this is a reply to an existing thread
    const existingThread = await detectExistingThread(
        headers,
        message.subject,
        message.fromEmail
    )

    if (existingThread) {
        if (existingThread.type === "email") {
            await appendEmailThreadReply(existingThread.id, message, appUrl)
        } else {
            await appendConcernThreadReply(existingThread.id, message, appUrl)
        }
        return
    }

    if (isConcern) {
        await createConcernFromEmail(message, appUrl)
    } else {
        await createEmailTicket(message, toAddresses[0] || payload.To, appUrl)
    }
}
