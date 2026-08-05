/**
 * suppressions.ts — Shared reads over the email_suppressions mirror and
 * users.email_status, used by the dispatcher, the Notifications page, and the
 * Postmark webhook. The mirror is written by the webhook (bounces, spam
 * complaints, subscription changes) and by our own preference actions when
 * they push suppressions to Postmark's API.
 */

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import { emailSuppressions, users } from "@/database/schema"

/** Of these emails, which are suppressed on the given stream? (lowercased) */
export async function getSuppressedEmails(
    emails: string[],
    streamId: string
): Promise<Set<string>> {
    if (emails.length === 0) return new Set()
    const lowered = emails.map((e) => e.toLowerCase())
    const rows = await db
        .select({ email: emailSuppressions.email })
        .from(emailSuppressions)
        .where(
            and(
                inArray(emailSuppressions.email, lowered),
                eq(emailSuppressions.stream_id, streamId)
            )
        )
    return new Set(rows.map((r) => r.email.toLowerCase()))
}

/**
 * Users whose address is dead for every stream: hard-bounced or spam-flagged.
 * 'unsubscribed' is deliberately NOT included — that state is per-stream and
 * the stream suppression check is authoritative for it.
 */
export async function getBlockedUserIds(
    userIds: string[]
): Promise<Set<string>> {
    if (userIds.length === 0) return new Set()
    const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(
            and(
                inArray(users.id, userIds),
                inArray(users.email_status, ["bounced", "spam_complaint"])
            )
        )
    return new Set(rows.map((r) => r.id))
}

/**
 * Re-derives users.email_status from the remaining suppression rows for an
 * address. Priority (highest wins): bounced > spam_complaint > unsubscribed >
 * valid. Extracted from the Postmark subscription-change webhook so the
 * preference actions can share it after deleting suppressions.
 */
export async function recomputeEmailStatus(
    email: string
): Promise<{ status: string; changed: boolean }> {
    const lowered = email.toLowerCase()
    const remaining = await db
        .select({ reason: emailSuppressions.reason })
        .from(emailSuppressions)
        .where(eq(emailSuppressions.email, lowered))

    let status = "valid"
    if (remaining.some((s) => s.reason === "HardBounce")) {
        status = "bounced"
    } else if (remaining.some((s) => s.reason === "SpamComplaint")) {
        status = "spam_complaint"
    } else if (remaining.length > 0) {
        status = "unsubscribed"
    }

    // Report whether this actually moved, so callers can audit real changes
    // rather than every webhook delivery.
    const [before] = await db
        .select({ status: users.email_status })
        .from(users)
        .where(eq(users.email, lowered))
        .limit(1)
    if (!before || before.status === status) {
        return { status, changed: false }
    }

    await db
        .update(users)
        .set({ email_status: status })
        .where(eq(users.email, lowered))
    return { status, changed: true }
}

export interface SuppressionState {
    streamId: string
    reason: string
    origin: string
    suppressedAt: Date
    /** Postmark refuses to reactivate spam complaints; everything else is deletable */
    canReactivate: boolean
}

/** All suppressions for an address, for the Notifications page banners. */
export async function getUserSuppressionState(
    email: string
): Promise<SuppressionState[]> {
    const rows = await db
        .select({
            streamId: emailSuppressions.stream_id,
            reason: emailSuppressions.reason,
            origin: emailSuppressions.origin,
            suppressedAt: emailSuppressions.suppressed_at
        })
        .from(emailSuppressions)
        .where(eq(emailSuppressions.email, email.toLowerCase()))
    return rows.map((row) => ({
        ...row,
        canReactivate: row.reason !== "SpamComplaint"
    }))
}
