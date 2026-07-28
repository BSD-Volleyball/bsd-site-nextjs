/**
 * postmark-sync.ts — Keeps Postmark's stream-level suppressions aligned with
 * category-level preference changes.
 *
 * Only the categories in CATEGORY_STREAM_SYNC are mirrored (broadcast-type
 * streams). Failure handling is deliberately asymmetric:
 *
 * - Opting OUT: the local opt-out rows already stop our own sends, so a
 *   Postmark API failure is logged and swallowed — the user's choice is
 *   honored either way.
 * - Opting back IN (reactivation): Postmark's suppression would keep blocking
 *   broadcast delivery no matter what our tables say, so the Postmark delete
 *   must succeed before the local row is removed; failures propagate.
 */

import { and, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { emailSuppressions, users } from "@/database/schema"
import { logger } from "@/lib/logger"
import {
    createStreamSuppression,
    deleteStreamSuppression,
    type MessageStream
} from "@/lib/postmark"
import { recomputeEmailStatus } from "./suppressions"
import {
    CATEGORY_STREAM_SYNC,
    type NotificationCategoryId,
    type NotificationType,
    typesInCategory
} from "./types"

function isCategoryFullyOptedOut(
    category: NotificationCategoryId,
    optedOut: Set<NotificationType>
): boolean {
    return typesInCategory(category).every((type) => optedOut.has(type))
}

async function findSuppression(email: string, streamId: string) {
    const [row] = await db
        .select({
            id: emailSuppressions.id,
            reason: emailSuppressions.reason
        })
        .from(emailSuppressions)
        .where(
            and(
                eq(emailSuppressions.email, email),
                eq(emailSuppressions.stream_id, streamId)
            )
        )
        .limit(1)
    return row ?? null
}

async function suppressStream(
    userId: string,
    email: string,
    streamId: MessageStream,
    origin: "Customer" | "Admin"
): Promise<void> {
    // Local mirror first — authoritative for our own send filtering — then
    // best-effort push to Postmark (its SubscriptionChange echo is a no-op
    // against the row we just wrote).
    const existing = await findSuppression(email, streamId)
    if (!existing) {
        await db.insert(emailSuppressions).values({
            user_id: userId,
            email,
            stream_id: streamId,
            reason: "ManualSuppression",
            origin
        })
    }
    await db
        .update(users)
        .set({ email_status: "unsubscribed" })
        .where(and(eq(users.email, email), eq(users.email_status, "valid")))

    try {
        await createStreamSuppression(streamId, email)
    } catch (error) {
        logger.error("[notifications] Postmark suppression create failed", {
            streamId,
            error: error instanceof Error ? error.message : String(error)
        })
    }
}

/**
 * Removes a stream suppression at Postmark and locally. Throws when Postmark
 * refuses (or the suppression is a spam complaint, which Postmark never
 * reactivates) so callers surface the failure instead of desyncing.
 */
export async function reactivateStreamSuppression(
    email: string,
    streamId: MessageStream
): Promise<void> {
    const existing = await findSuppression(email, streamId)
    if (!existing) return
    if (existing.reason === "SpamComplaint") {
        throw new Error(
            "Spam-complaint suppressions cannot be reactivated automatically."
        )
    }

    await deleteStreamSuppression(streamId, email)
    await db
        .delete(emailSuppressions)
        .where(eq(emailSuppressions.id, existing.id))
    await recomputeEmailStatus(email)
}

/**
 * Applies category-level Postmark sync after a preference save. `before` and
 * `after` are the user's full opted-out sets around the change.
 */
export async function syncCategoryOptouts(opts: {
    userId: string
    email: string
    before: Set<NotificationType>
    after: Set<NotificationType>
    origin: "Customer" | "Admin"
}): Promise<void> {
    const email = opts.email.toLowerCase()

    for (const [category, stream] of Object.entries(CATEGORY_STREAM_SYNC) as [
        NotificationCategoryId,
        MessageStream
    ][]) {
        const wasFull = isCategoryFullyOptedOut(category, opts.before)
        const isFull = isCategoryFullyOptedOut(category, opts.after)
        if (wasFull === isFull) continue

        if (isFull) {
            await suppressStream(opts.userId, email, stream, opts.origin)
        } else {
            const existing = await findSuppression(email, stream)
            // Only clear suppressions our own preference flow created;
            // recipient-originated unsubscribes/bounces need the explicit
            // "Resume emails" action so re-ticking a checkbox can't silently
            // override an unsubscribe the user made in their mail client.
            if (existing && existing.reason === "ManualSuppression") {
                try {
                    await reactivateStreamSuppression(email, stream)
                } catch (error) {
                    logger.error(
                        "[notifications] Postmark suppression delete failed",
                        {
                            streamId: stream,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error)
                        }
                    )
                }
            }
        }
    }
}
