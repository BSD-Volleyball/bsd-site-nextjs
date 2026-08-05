/**
 * dispatch.ts — Central notification dispatcher.
 *
 * Every automated notification email goes through dispatchNotification(),
 * which composes the checks no individual trigger should reimplement:
 * per-type opt-outs → per-stream Postmark suppressions → dead-address
 * email_status → optional dedupe claim (cron idempotency) → one-click
 * unsubscribe headers → batch send → notification_log records.
 *
 * It never throws: a notification failure must never fail the domain action
 * that triggered it (a draft submission is not invalid because an email
 * bounced). Callers get counts back and the details land in the log table
 * and structured logs.
 */

import { and, eq, inArray } from "drizzle-orm"
import { site } from "@/config/site"
import { db } from "@/database/db"
import { notificationLog } from "@/database/schema"
import { applyEmailSubjectPrefix } from "@/lib/email-subject"
import { isLegacyEmail } from "@/lib/legacy-matching"
import { logger } from "@/lib/logger"
import { type BatchEmailMessage, sendBatchEmails } from "@/lib/postmark"
import { getOptedOutUserIds } from "./preferences"
import { getBlockedUserIds, getSuppressedEmails } from "./suppressions"
import { NOTIFICATION_TYPES, type NotificationType } from "./types"
import { createUnsubscribeToken } from "./unsubscribe-token"

export interface NotificationRecipient {
    userId: string
    email: string
    firstName?: string
}

type PerRecipient = string | ((recipient: NotificationRecipient) => string)

export interface DispatchOptions {
    type: NotificationType
    recipients: NotificationRecipient[]
    subject: PerRecipient
    htmlBody: PerRecipient
    textBody?: PerRecipient
    /** Postmark tag for analytics; defaults to the type with dashes */
    tag?: string
    /**
     * Idempotency key for scheduled sends (e.g. `match-123-2026-08-01`).
     * When set, each (type, dedupeKey, email) is claimed in notification_log
     * before sending; already-claimed recipients are silently skipped, so
     * re-running the same dispatch cannot double-send.
     */
    dedupeKey?: string
}

export interface DispatchResult {
    sent: number
    failed: number
    skipped: number
}

function render(value: PerRecipient, recipient: NotificationRecipient): string {
    return typeof value === "function" ? value(recipient) : value
}

/**
 * Subjects leave with the shared "[BSD] " marker so members can filter every
 * message from the league the same way, whether it came from the Send Email
 * page or an automated trigger. Applied centrally here rather than at each
 * call site so a new notification type cannot forget it; the helper strips
 * any prefix the caller already added, so it never doubles.
 */
function renderSubject(
    value: PerRecipient,
    recipient: NotificationRecipient
): string {
    return applyEmailSubjectPrefix(render(value, recipient))
}

export function buildUnsubscribeUrl(token: string): string {
    return `${site.publicUrl}/api/email/unsubscribe?token=${encodeURIComponent(token)}`
}

export async function dispatchNotification(
    opts: DispatchOptions
): Promise<DispatchResult> {
    const zero: DispatchResult = { sent: 0, failed: 0, skipped: 0 }
    try {
        const def = NOTIFICATION_TYPES[opts.type]
        if (!def) {
            logger.error("[notifications] Unknown notification type", {
                type: opts.type
            })
            return zero
        }
        const tag = opts.tag ?? opts.type.replaceAll("_", "-")

        // Dedupe by lowercased email; drop recipients without a reachable
        // address. Legacy placeholders count as unaddressed: the archive
        // backfill invented those addresses, so a message to one is a
        // guaranteed bounce rather than a delivery worth attempting.
        const seen = new Set<string>()
        let unaddressable = 0
        let recipients = opts.recipients.filter((r) => {
            const email = r.email?.toLowerCase()
            if (!email || seen.has(email)) return false
            if (isLegacyEmail(email)) {
                unaddressable++
                return false
            }
            seen.add(email)
            return true
        })
        const initial = recipients.length
        if (initial === 0) return { ...zero, skipped: unaddressable }

        if (!def.mandatory) {
            const optedOut = await getOptedOutUserIds(
                opts.type,
                recipients.map((r) => r.userId)
            )
            recipients = recipients.filter((r) => !optedOut.has(r.userId))
        }

        const suppressed = await getSuppressedEmails(
            recipients.map((r) => r.email),
            def.stream
        )
        recipients = recipients.filter(
            (r) => !suppressed.has(r.email.toLowerCase())
        )

        const blocked = await getBlockedUserIds(recipients.map((r) => r.userId))
        recipients = recipients.filter((r) => !blocked.has(r.userId))

        if (recipients.length === 0) {
            return { ...zero, skipped: unaddressable + initial }
        }

        // Claim-then-send: the partial unique index on (type, dedupe_key,
        // email) makes the insert a no-op for anything already claimed, so
        // only freshly claimed recipients get a message.
        if (opts.dedupeKey) {
            const claimed = await db
                .insert(notificationLog)
                .values(
                    recipients.map((r) => ({
                        user_id: r.userId,
                        email: r.email.toLowerCase(),
                        notification_type: opts.type,
                        stream_id: def.stream,
                        tag,
                        subject: renderSubject(opts.subject, r),
                        dedupe_key: opts.dedupeKey,
                        status: "claimed"
                    }))
                )
                .onConflictDoNothing()
                .returning({ email: notificationLog.email })
            const claimedSet = new Set(claimed.map((r) => r.email))
            recipients = recipients.filter((r) =>
                claimedSet.has(r.email.toLowerCase())
            )
            if (recipients.length === 0) {
                return { ...zero, skipped: initial }
            }
        }

        const messages: BatchEmailMessage[] = recipients.map((r) => {
            const token = def.mandatory
                ? null
                : createUnsubscribeToken(r.userId, opts.type)
            return {
                from: site.mailFrom,
                to: r.email,
                subject: renderSubject(opts.subject, r),
                htmlBody: render(opts.htmlBody, r),
                textBody: opts.textBody ? render(opts.textBody, r) : undefined,
                stream: def.stream,
                tag,
                headers: token
                    ? [
                          {
                              name: "List-Unsubscribe",
                              value: `<${buildUnsubscribeUrl(token)}>`
                          },
                          {
                              name: "List-Unsubscribe-Post",
                              value: "List-Unsubscribe=One-Click"
                          }
                      ]
                    : undefined
            }
        })

        const { results } = await sendBatchEmails(messages)
        const byEmail = new Map(
            results.map((r) => [r.to.toLowerCase(), r] as const)
        )

        const outcomes = recipients.map((r) => {
            const result = byEmail.get(r.email.toLowerCase())
            const ok = result !== undefined && result.errorCode === 0
            return {
                recipient: r,
                ok,
                messageId: result?.messageId ?? null
            }
        })
        const sent = outcomes.filter((o) => o.ok).length
        const failed = outcomes.length - sent

        if (opts.dedupeKey) {
            // Claimed rows already exist; flip each cohort's status in one
            // update. Postmark message ids are per-recipient, so record them
            // only for the (rare) single-recipient dispatch to keep this at
            // two queries.
            for (const ok of [true, false]) {
                const cohort = outcomes.filter((o) => o.ok === ok)
                if (cohort.length === 0) continue
                await db
                    .update(notificationLog)
                    .set({
                        status: ok ? "sent" : "failed",
                        postmark_message_id:
                            cohort.length === 1 ? cohort[0].messageId : null
                    })
                    .where(
                        and(
                            eq(notificationLog.notification_type, opts.type),
                            eq(notificationLog.dedupe_key, opts.dedupeKey),
                            inArray(
                                notificationLog.email,
                                cohort.map((o) =>
                                    o.recipient.email.toLowerCase()
                                )
                            )
                        )
                    )
            }
        } else {
            await db.insert(notificationLog).values(
                outcomes.map((o) => ({
                    user_id: o.recipient.userId,
                    email: o.recipient.email.toLowerCase(),
                    notification_type: opts.type,
                    stream_id: def.stream,
                    tag,
                    subject: renderSubject(opts.subject, o.recipient),
                    status: o.ok ? "sent" : "failed",
                    postmark_message_id: o.messageId
                }))
            )
        }

        const skipped = unaddressable + (initial - recipients.length)
        if (skipped > 0 || failed > 0) {
            logger.info("[notifications] Dispatch complete", {
                type: opts.type,
                sent,
                failed,
                skipped
            })
        }
        return { sent, failed, skipped }
    } catch (error) {
        logger.error("[notifications] Dispatch failed", {
            type: opts.type,
            error: error instanceof Error ? error.message : String(error)
        })
        return { ...zero, skipped: opts.recipients.length }
    }
}
