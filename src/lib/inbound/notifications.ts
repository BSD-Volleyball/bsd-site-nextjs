import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { sendMail } from "@/lib/email/send"
import {
    buildConcernNotificationHtml,
    buildInboundEmailNotificationHtml,
    buildThreadReplyNotificationHtml,
    type InboundMessageSummary
} from "@/lib/email-html"
import { logger } from "@/lib/logger"
import { getRecipientsWithRole } from "@/lib/rbac"

/**
 * Staff notifications are best-effort by construction.
 *
 * These run *after* the ticket row is committed, so a throw here used to
 * escape to the route handler, return HTTP 400, and make Postmark redeliver
 * the same inbound message — creating a duplicate ticket every retry.
 * sendMail already never throws; this guard covers the role lookups too.
 */
export async function notifyQuietly(
    fn: () => Promise<unknown>,
    context: string
) {
    try {
        await fn()
    } catch (error) {
        logger.error(`[postmark-webhook] ${context} notification failed`, {
            error: error instanceof Error ? error.message : String(error)
        })
    }
}

export async function notifyOmbudsmen(appUrl: string) {
    await sendMail({
        mode: { kind: "staff", category: "concern_submitted_by_email" },
        recipients: await getRecipientsWithRole("ombudsman"),
        subject: "New Concern Submitted via Email",
        htmlBody: buildConcernNotificationHtml(appUrl),
        tag: "concern-notification"
    })
}

/**
 * "Jane Doe: Question about the league" — the sender and subject as they
 * should read in a notification subject line. Falls back to the address when
 * the sender has no display name.
 */
function describeInbound(message: InboundMessageSummary): string {
    const sender = message.fromName?.trim() || message.fromAddress || "unknown"
    return `from ${sender}: ${message.subject ?? "(No subject)"}`
}

export async function notifyAdmins(opts: {
    appUrl: string
    ticketId: number
    message: InboundMessageSummary
}) {
    await sendMail({
        mode: { kind: "staff", category: "inbound_email_received" },
        recipients: await getRecipientsWithRole("admin"),
        subject: `New Inbound Email ${describeInbound(opts.message)}`,
        htmlBody: buildInboundEmailNotificationHtml({
            appUrl: opts.appUrl,
            ticketId: opts.ticketId,
            ...opts.message
        }),
        tag: "inbound-email-notification"
    })
}

export async function notifyAssignee(opts: {
    assignedTo: string | null
    appUrl: string
    ticketType: "email" | "concern"
    ticketId: number
    /** Sender + subject; only forwarded for email threads, never concerns. */
    message?: InboundMessageSummary
}) {
    const label = opts.ticketType === "email" ? "Email" : "Concern"
    // Concern notifications stay content-free: the concern inbox is far more
    // sensitive than general email, so the nudge says only that a reply exists.
    const message = opts.ticketType === "email" ? opts.message : undefined
    const notifHtml = buildThreadReplyNotificationHtml({
        appUrl: opts.appUrl,
        ticketType: opts.ticketType,
        ticketId: opts.ticketId,
        ...message
    })

    // The assignee if there is one; otherwise the whole group that owns
    // this kind of ticket, so a reply is never left unseen.
    let recipients: { userId: string; email: string }[] = []
    if (opts.assignedTo) {
        const [assignee] = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(eq(users.id, opts.assignedTo))
            .limit(1)
        if (assignee?.email) {
            recipients = [{ userId: assignee.id, email: assignee.email }]
        }
    }
    if (recipients.length === 0) {
        recipients = await getRecipientsWithRole(
            opts.ticketType === "email" ? "admin" : "ombudsman"
        )
    }

    await sendMail({
        mode: { kind: "staff", category: "thread_reply" },
        recipients,
        subject: message
            ? `New Reply on ${label} #${opts.ticketId} ${describeInbound(message)}`
            : `New Reply on ${label} #${opts.ticketId}`,
        htmlBody: notifHtml,
        tag: "thread-reply-notification"
    })
}
