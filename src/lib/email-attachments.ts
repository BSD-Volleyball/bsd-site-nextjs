import "server-only"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import { type AttachmentParentType, emailAttachments } from "@/database/schema"
import { logger } from "@/lib/logger"
import { putR2Object } from "@/lib/r2"

/** Shape of an attachment as sent to the client — never includes the R2 key. */
export interface AttachmentMeta {
    id: number
    filename: string
    content_type: string
    size_bytes: number
    content_id: string | null
}

/** Attachment entry as delivered by Postmark's inbound webhook. */
export interface PostmarkAttachment {
    Name: string
    Content: string
    ContentType: string
    ContentLength: number
    ContentID?: string | null
}

const MAX_FILENAME_LENGTH = 255

/**
 * Reduce an arbitrary sender-supplied name to something safe to store as a
 * display name and embed in an object key: no path separators, control
 * characters or leading dots. Falls back to a generic name when nothing is
 * left.
 */
export function sanitizeFilename(name: string, fallback: string): string {
    const cleaned = name
        // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
        .replace(/[\\/\x00-\x1f\x7f]/g, "_")
        .replace(/^\.+/, "")
        .trim()
        .slice(0, MAX_FILENAME_LENGTH)
    return cleaned.length > 0 ? cleaned : fallback
}

/** Object keys only get a conservative character set. */
function keySegment(value: string): string {
    return value.replace(/[^A-Za-z0-9._-]/g, "_")
}

export function buildAttachmentKey(
    messageId: string,
    index: number,
    filename: string
): string {
    return `email-attachments/${keySegment(messageId)}/${index}-${keySegment(filename)}`
}

/**
 * Upload each Postmark attachment to R2 and record its metadata.
 *
 * Never throws: Postmark redelivers on a non-2xx response, and the ticket row
 * is already committed by the time this runs, so a storage failure surfacing
 * as a webhook error would create duplicate tickets. A failed file is logged
 * and skipped; the rest still land.
 */
export async function storeInboundAttachments(params: {
    parentType: AttachmentParentType
    parentId: number
    messageId: string
    attachments: PostmarkAttachment[] | null | undefined
}): Promise<void> {
    const { parentType, parentId, messageId } = params
    const attachments = params.attachments ?? []

    for (const [index, attachment] of attachments.entries()) {
        if (!attachment?.Content) continue

        const filename = sanitizeFilename(
            attachment.Name ?? "",
            `attachment-${index + 1}`
        )
        const contentType = attachment.ContentType || "application/octet-stream"
        const key = buildAttachmentKey(messageId, index, filename)

        try {
            const body = Buffer.from(attachment.Content, "base64")
            await putR2Object({ key, body, contentType })
            await db.insert(emailAttachments).values({
                parent_type: parentType,
                parent_id: parentId,
                filename,
                content_type: contentType,
                size_bytes: body.length,
                r2_key: key,
                content_id: attachment.ContentID || null
            })
        } catch (error) {
            logger.error("[email-attachments] Failed to store attachment", {
                parentType,
                parentId,
                messageId,
                filename,
                error: error instanceof Error ? error.message : String(error)
            })
        }
    }
}

/** Attachments for many parents of one type, grouped by parent id. */
export async function listAttachmentsFor(
    parentType: AttachmentParentType,
    parentIds: number[]
): Promise<Map<number, AttachmentMeta[]>> {
    const result = new Map<number, AttachmentMeta[]>()
    if (parentIds.length === 0) return result

    const rows = await db
        .select({
            id: emailAttachments.id,
            parent_id: emailAttachments.parent_id,
            filename: emailAttachments.filename,
            content_type: emailAttachments.content_type,
            size_bytes: emailAttachments.size_bytes,
            content_id: emailAttachments.content_id
        })
        .from(emailAttachments)
        .where(
            and(
                eq(emailAttachments.parent_type, parentType),
                inArray(emailAttachments.parent_id, parentIds)
            )
        )
        .orderBy(emailAttachments.id)

    for (const row of rows) {
        const list = result.get(row.parent_id) ?? []
        list.push({
            id: row.id,
            filename: row.filename,
            content_type: row.content_type,
            size_bytes: row.size_bytes,
            content_id: row.content_id
        })
        result.set(row.parent_id, list)
    }
    return result
}
