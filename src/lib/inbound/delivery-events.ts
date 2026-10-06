/**
 * Postmark delivery webhooks — subscription changes, bounces and spam
 * complaints — and the suppression rows and email_status they drive.
 */
import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { emailSuppressions, users } from "@/database/schema"
import { logAuditEntry } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { recomputeEmailStatus } from "@/lib/notifications/suppressions"
import { isPermanentBounceType } from "@/lib/postmark"
import type {
    PostmarkBouncePayload,
    PostmarkSpamComplaintPayload,
    PostmarkSubscriptionChangePayload
} from "./postmark-payloads"

// Mask an email address for log output (j***@example.com): enough to
// correlate a report with a user without writing raw PII into the logs.
export function maskEmail(email: string): string {
    const [local, domain] = email.split("@")
    if (!domain) return "***"
    return `${local.slice(0, 1)}***@${domain}`
}

/**
 * Record an email-status change driven by Postmark.
 *
 * The actor is an external system, but audit_log keys on a user, so the entry
 * is attributed to the affected player with the origin named in the summary.
 * Addresses with no matching account get no entry — the suppression row is the
 * only record that exists for those.
 */
async function logEmailStatusChange(email: string, summary: string) {
    const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
    if (!user) return
    await logAuditEntry({
        userId: user.id,
        action: "update_email_status",
        entityType: "users",
        entityId: user.id,
        summary
    })
}

// ---------------------------------------------------------------------------
// Subscription change handling
// ---------------------------------------------------------------------------

export async function handleSubscriptionChange(
    payload: PostmarkSubscriptionChangePayload
) {
    const email = payload.Recipient?.toLowerCase()
    const streamId = payload.MessageStream
    if (!email || !streamId) return

    if (payload.SuppressSending) {
        const existing = await db
            .select({ id: emailSuppressions.id })
            .from(emailSuppressions)
            .where(
                and(
                    eq(emailSuppressions.email, email),
                    eq(emailSuppressions.stream_id, streamId)
                )
            )
            .limit(1)

        if (existing.length === 0) {
            const [user] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.email, email))
                .limit(1)

            await db.insert(emailSuppressions).values({
                user_id: user?.id ?? null,
                email,
                stream_id: streamId,
                reason: payload.SuppressionReason ?? "ManualSuppression",
                origin: payload.Origin ?? "Recipient",
                suppressed_at: payload.Timestamp
                    ? new Date(payload.Timestamp)
                    : new Date()
            })
        }

        // Only set to 'unsubscribed' if not already at a higher-priority status
        const downgraded = await db
            .update(users)
            .set({ email_status: "unsubscribed" })
            .where(and(eq(users.email, email), eq(users.email_status, "valid")))
            .returning({ id: users.id })
        if (downgraded.length > 0) {
            await logEmailStatusChange(
                email,
                `Email status set to "unsubscribed" by Postmark subscription change (stream ${streamId}, reason ${payload.SuppressionReason ?? "ManualSuppression"}, origin ${payload.Origin ?? "Recipient"})`
            )
        }
    } else {
        // Remove this stream's suppression
        await db
            .delete(emailSuppressions)
            .where(
                and(
                    eq(emailSuppressions.email, email),
                    eq(emailSuppressions.stream_id, streamId)
                )
            )

        // Re-derive email_status from whatever suppressions remain
        const recomputed = await recomputeEmailStatus(email)
        if (recomputed.changed) {
            await logEmailStatusChange(
                email,
                `Email status set to "${recomputed.status}" after Postmark removed the ${streamId} suppression`
            )
        }
    }

    logger.info("[postmark-webhook] Subscription change", {
        maskedEmail: maskEmail(email),
        stream: streamId,
        suppressed: payload.SuppressSending
    })
}

// ---------------------------------------------------------------------------
// Bounce handling
// ---------------------------------------------------------------------------

export async function handleBounce(payload: PostmarkBouncePayload) {
    const email = payload.Email?.toLowerCase()
    const streamId = payload.MessageStream
    if (!email) return

    const isHardBounce = payload.Type === "HardBounce"

    // Temporary failures (SoftBounce, Transient, and notably Gmail's
    // rate-limiting SpamNotification) must not create a suppression row —
    // filterSuppressed() treats any row as permanent, so recording one here
    // silently removes a valid recipient from every future broadcast. Postmark
    // retains the full bounce history for diagnostics either way.
    if (!isPermanentBounceType(payload.Type)) {
        logger.info("[postmark-webhook] Transient bounce (not suppressing)", {
            maskedEmail: maskEmail(email),
            bounceType: payload.Type,
            stream: streamId
        })
        return
    }

    // Record suppression for permanent bounce types only
    const existing = await db
        .select({ id: emailSuppressions.id })
        .from(emailSuppressions)
        .where(
            and(
                eq(emailSuppressions.email, email),
                eq(emailSuppressions.stream_id, streamId ?? "outbound")
            )
        )
        .limit(1)

    if (existing.length === 0) {
        const [user] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, email))
            .limit(1)

        await db.insert(emailSuppressions).values({
            user_id: user?.id ?? null,
            email,
            stream_id: streamId ?? "outbound",
            reason: payload.Type ?? "HardBounce",
            origin: "Recipient",
            suppressed_at: payload.BouncedAt
                ? new Date(payload.BouncedAt)
                : new Date()
        })
    }

    // Only hard bounces mark the address itself dead; a SpamComplaint reaching
    // this point gets its email_status from the dedicated SpamComplaint webhook.
    if (isHardBounce) {
        const marked = await db
            .update(users)
            .set({ email_status: "bounced" })
            .where(eq(users.email, email))
            .returning({ id: users.id })
        if (marked.length > 0) {
            await logEmailStatusChange(
                email,
                `Email status set to "bounced" by Postmark hard bounce (stream ${streamId}, type ${payload.Type})`
            )
        }
    }

    logger.info("[postmark-webhook] Bounce", {
        maskedEmail: maskEmail(email),
        bounceType: payload.Type,
        stream: streamId
    })
}

// ---------------------------------------------------------------------------
// Spam complaint handling
// ---------------------------------------------------------------------------

export async function handleSpamComplaint(
    payload: PostmarkSpamComplaintPayload
) {
    const email = payload.Email?.toLowerCase()
    const streamId = payload.MessageStream
    if (!email) return

    const existing = await db
        .select({ id: emailSuppressions.id })
        .from(emailSuppressions)
        .where(
            and(
                eq(emailSuppressions.email, email),
                eq(emailSuppressions.stream_id, streamId ?? "outbound")
            )
        )
        .limit(1)

    if (existing.length === 0) {
        const [user] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, email))
            .limit(1)

        await db.insert(emailSuppressions).values({
            user_id: user?.id ?? null,
            email,
            stream_id: streamId ?? "outbound",
            reason: "SpamComplaint",
            origin: "Recipient",
            suppressed_at: payload.BouncedAt
                ? new Date(payload.BouncedAt)
                : new Date()
        })
    }

    // Spam complaint takes priority over unsubscribed but not over bounced
    const fromValid = await db
        .update(users)
        .set({ email_status: "spam_complaint" })
        .where(and(eq(users.email, email), eq(users.email_status, "valid")))
        .returning({ id: users.id })
    const fromUnsubscribed = await db
        .update(users)
        .set({ email_status: "spam_complaint" })
        .where(
            and(eq(users.email, email), eq(users.email_status, "unsubscribed"))
        )
        .returning({ id: users.id })
    if (fromValid.length > 0 || fromUnsubscribed.length > 0) {
        await logEmailStatusChange(
            email,
            `Email status set to "spam_complaint" by Postmark spam complaint (stream ${streamId ?? "outbound"})`
        )
    }

    logger.info("[postmark-webhook] Spam complaint", {
        maskedEmail: maskEmail(email),
        stream: streamId
    })
}
