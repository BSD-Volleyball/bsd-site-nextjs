/**
 * dispatch.ts — notification-shaped entry point onto the shared email funnel.
 *
 * The pipeline this used to own (opt-outs → suppressions → dead addresses →
 * dedupe claim → unsubscribe headers → batch send → notification_log) now
 * lives in src/lib/email/send.ts, which applies it to every kind of outbound
 * mail rather than only to notifications. This module stays as the typed,
 * notification-specific façade so the ~16 triggers that call it — and the
 * tests pinning their behaviour — are unaffected by that move.
 *
 * It never throws: a notification failure must never fail the domain action
 * that triggered it (a draft submission is not invalid because an email
 * bounced). Callers get counts back and the details land in the log table
 * and structured logs.
 */

import { sendMail, type MailRecipient } from "@/lib/email/send"
import type { NotificationType } from "./types"

export { buildUnsubscribeUrl } from "@/lib/email/send"

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

/**
 * Notification recipients always carry a userId, so the funnel's optional
 * form can be narrowed back for the caller-supplied render functions.
 */
function adapt(value: PerRecipient): (r: MailRecipient) => string {
    return (r) =>
        typeof value === "function"
            ? value({
                  userId: r.userId as string,
                  email: r.email,
                  firstName: r.firstName
              })
            : value
}

export async function dispatchNotification(
    opts: DispatchOptions
): Promise<DispatchResult> {
    const { sent, failed, skipped } = await sendMail({
        mode: {
            kind: "notification",
            type: opts.type,
            dedupeKey: opts.dedupeKey
        },
        recipients: opts.recipients,
        subject: adapt(opts.subject),
        htmlBody: adapt(opts.htmlBody),
        textBody: opts.textBody ? adapt(opts.textBody) : undefined,
        tag: opts.tag
    })
    return { sent, failed, skipped }
}
