import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    type AttachmentParentType,
    concernReceived,
    concerns,
    inboundEmailReceived,
    inboundEmails
} from "@/database/schema"

/**
 * Locate the row a Postmark MessageID was already recorded against, if any.
 * Postmark retries and manual redeliveries carry the same MessageID, so this
 * is what keeps a redelivery from minting a duplicate ticket.
 */
export async function findRecordedMessage(
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
export function isUniqueViolation(error: unknown): boolean {
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
export async function insertUnlessRedelivered<T>(
    insert: () => Promise<T>
): Promise<T | null> {
    try {
        return await insert()
    } catch (error) {
        if (isUniqueViolation(error)) return null
        throw error
    }
}
