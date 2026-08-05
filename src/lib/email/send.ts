/**
 * send.ts — the single outbound email funnel.
 *
 * Every message the app sends goes through sendMail(). Before this existed,
 * mail left through four different primitives across ~30 call sites, and the
 * checks each one applied were whatever its author remembered: broadcasts
 * never consulted users.email_status, staff notices skipped suppressions
 * entirely, and half the volume was recorded nowhere.
 *
 * The fix is not one policy for everything — a password reset must reach a
 * hard-bounced address while a broadcast must not — but one *place* where the
 * policy is chosen. `MailMode` names the kind of message; MODE_POLICY below is
 * the whole decision table.
 *
 * sendMail never throws. A notification failure must not fail the domain
 * action that triggered it: a draft submission is not invalid because an email
 * bounced. Callers get counts back, and detail lands in notification_log and
 * the structured logs.
 */

import "server-only"

import { and, eq, inArray } from "drizzle-orm"

import { site } from "@/config/site"
import { db } from "@/database/db"
import { notificationLog } from "@/database/schema"
import { applyEmailSubjectPrefix } from "@/lib/email-subject"
import { isLegacyEmail } from "@/lib/legacy-matching"
import { logger } from "@/lib/logger"
import {
    type BatchEmailMessage,
    type MessageStream,
    type STREAM_BROADCAST,
    type STREAM_IN_SEASON_UPDATES,
    STREAM_OUTBOUND,
    sendBatchEmails,
    sendEmail
} from "@/lib/postmark"
import { getOptedOutUserIds } from "@/lib/notifications/preferences"
import {
    getBlockedUserIds,
    getSuppressedEmails
} from "@/lib/notifications/suppressions"
import {
    NOTIFICATION_TYPES,
    STREAM_TO_TYPE,
    type NotificationType
} from "@/lib/notifications/types"
import { createUnsubscribeToken } from "@/lib/notifications/unsubscribe-token"

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

export type BroadcastStream =
    | typeof STREAM_BROADCAST
    | typeof STREAM_IN_SEASON_UPDATES

export type MailMode =
    /** Automated member mail tied to a preference type. */
    | { kind: "notification"; type: NotificationType; dedupeKey?: string }
    /** Account and money mail the member must receive to use the app. */
    | { kind: "transactional"; category: string }
    /** Operational notices to admins/ombudsmen, often with no user row. */
    | { kind: "staff"; category: string }
    /** Bulk sends from the Send Email page. */
    | { kind: "broadcast"; stream: BroadcastStream; broadcastId: number }
    /** Replies on a concern/inbound-email thread, to arbitrary addresses. */
    | { kind: "reply"; category: string }

export type MailModeKind = MailMode["kind"]

interface ModePolicy {
    /** Honour per-type opt-outs from the Notifications page. */
    optOut: boolean
    /** Honour Postmark per-stream suppressions. */
    suppression: boolean
    /** Skip addresses that hard-bounced or filed a spam complaint. */
    deadAddress: boolean
    /** Attach RFC 8058 one-click unsubscribe headers. */
    unsubscribeHeader: boolean
    /** Prepend the shared "[BSD] " marker. */
    subjectPrefix: boolean
}

/**
 * The entire policy surface, in one table.
 *
 * `transactional` deliberately skips every filter. A password reset or a
 * payment receipt has to go out even to an address Postmark believes is dead —
 * a single wrong bounce would otherwise lock a member out of account recovery
 * with no way back in. That is a considered trade, not an oversight.
 *
 * `reply` skips the subject prefix because applyEmailSubjectPrefix only strips
 * a *leading* marker, so prefixing "Re: …" yields "[BSD] Re: [BSD] …" and
 * breaks threading (pinned by email-subject.test.ts).
 *
 * `staff` has no opt-out because no preference type covers operational mail,
 * but it still respects suppressions: a staff member whose address hard-bounced
 * is not reachable, and hammering it hurts the sending domain.
 */
const MODE_POLICY: Record<MailModeKind, ModePolicy> = {
    notification: {
        optOut: true,
        suppression: true,
        deadAddress: true,
        unsubscribeHeader: true,
        subjectPrefix: true
    },
    transactional: {
        optOut: false,
        suppression: false,
        deadAddress: false,
        unsubscribeHeader: false,
        subjectPrefix: true
    },
    staff: {
        optOut: false,
        suppression: true,
        deadAddress: true,
        unsubscribeHeader: false,
        subjectPrefix: true
    },
    broadcast: {
        optOut: true,
        suppression: true,
        deadAddress: true,
        unsubscribeHeader: true,
        subjectPrefix: true
    },
    reply: {
        optOut: false,
        suppression: false,
        deadAddress: false,
        unsubscribeHeader: false,
        subjectPrefix: false
    }
}

// ---------------------------------------------------------------------------
// Inputs and result
// ---------------------------------------------------------------------------

export interface MailRecipient {
    /** Absent for staff/external addresses with no account. */
    userId?: string
    email: string
    firstName?: string
}

export type PerRecipient = string | ((recipient: MailRecipient) => string)

export interface MailAttachment {
    name: string
    /** base64 */
    content: string
    contentType: string
    contentId?: string
}

export interface SendMailOptions {
    mode: MailMode
    recipients: MailRecipient[]
    subject: PerRecipient
    htmlBody: PerRecipient
    textBody?: PerRecipient
    /** Postmark tag for analytics. Defaults from the mode. */
    tag?: string
    /** Defaults to site.mailFrom. */
    from?: string
    /** Display name; forces the single-message transport. */
    fromName?: string
    replyTo?: string
    /** Threading header; forces the single-message transport. */
    inReplyTo?: string
    headers?: { name: string; value: string }[]
    /** Forces the single-message transport. */
    attachments?: MailAttachment[]
    /**
     * Addresses appended AFTER every policy filter, deduped against the
     * filtered list. For aliases and oversight copies that are not members —
     * the directors group, or a composer testing their own broadcast — where
     * a per-user opt-out or suppression must not be able to drop them.
     */
    alwaysInclude?: string[]
}

export interface SendMailResult {
    sent: number
    failed: number
    skipped: number
    /** lowercased email → Postmark message id, for callers that store it. */
    messageIds: Map<string, string>
}

const EMPTY_RESULT = (): SendMailResult => ({
    sent: 0,
    failed: 0,
    skipped: 0,
    messageIds: new Map()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function render(value: PerRecipient, recipient: MailRecipient): string {
    return typeof value === "function" ? value(recipient) : value
}

/** The stream a mode sends on. */
function streamFor(mode: MailMode): MessageStream {
    if (mode.kind === "notification") {
        return NOTIFICATION_TYPES[mode.type].stream
    }
    if (mode.kind === "broadcast") return mode.stream
    return STREAM_OUTBOUND
}

/**
 * The value stored in notification_log.notification_type: the registered type
 * for notifications, otherwise the mode's category.
 */
function logTypeFor(mode: MailMode): string {
    if (mode.kind === "notification") return mode.type
    // Broadcasts have no category — the stream is the meaningful label
    // ("broadcast" vs "in-season-updates") in an admin's email history.
    if (mode.kind === "broadcast") return mode.stream
    return mode.category
}

function defaultTagFor(mode: MailMode): string {
    return logTypeFor(mode).replaceAll("_", "-")
}

/**
 * Opt-outs are per notification type. Broadcasts map their stream to a type
 * via STREAM_TO_TYPE; in-season-updates has no mapping because it is
 * mandatory, so those sends are not opt-outable.
 */
function optOutTypeFor(mode: MailMode): NotificationType | null {
    if (mode.kind === "notification") {
        return NOTIFICATION_TYPES[mode.type].mandatory ? null : mode.type
    }
    if (mode.kind === "broadcast") {
        return STREAM_TO_TYPE[mode.stream] ?? null
    }
    return null
}

/**
 * Which Postmark transport to use.
 *
 * Attachments, a display-name From, and In-Reply-To only exist on the
 * single-message API, so they force it. Beyond that, anything that is 1:1 by
 * nature — a receipt, a password reset, a ticket reply — goes single too: the
 * message id comes back cleanly for the caller to store, which the reply
 * threads depend on. Notifications and broadcasts are bulk by nature and use
 * the batch API even when today's audience happens to be one person.
 */
function needsSingleTransport(
    opts: SendMailOptions,
    recipientCount: number
): boolean {
    if (opts.attachments?.length || opts.fromName || opts.inReplyTo) return true
    const bulk =
        opts.mode.kind === "notification" || opts.mode.kind === "broadcast"
    return !bulk && recipientCount === 1
}

/**
 * Drops recipients this mode must not mail: per-type opt-outs, per-stream
 * Postmark suppressions, and addresses that hard-bounced or filed a spam
 * complaint. Recipients with no userId skip the user-keyed checks — a staff
 * alias has no preferences to honour — but are still suppression-checked.
 *
 * Exported so the Send Email preview counts the same audience the send will
 * actually reach; computing it twice by hand is how the two drifted before.
 */
export async function applyPolicyFilters(
    mode: MailMode,
    recipients: MailRecipient[]
): Promise<MailRecipient[]> {
    const policy = MODE_POLICY[mode.kind]
    const stream = streamFor(mode)
    let remaining = recipients

    const optOutType = policy.optOut ? optOutTypeFor(mode) : null
    if (optOutType) {
        const optedOut = await getOptedOutUserIds(
            optOutType,
            remaining
                .map((r) => r.userId)
                .filter((id): id is string => Boolean(id))
        )
        remaining = remaining.filter(
            (r) => !r.userId || !optedOut.has(r.userId)
        )
    }

    if (policy.suppression) {
        const suppressed = await getSuppressedEmails(
            remaining.map((r) => r.email),
            stream
        )
        remaining = remaining.filter(
            (r) => !suppressed.has(r.email.toLowerCase())
        )
    }

    if (policy.deadAddress) {
        const blocked = await getBlockedUserIds(
            remaining
                .map((r) => r.userId)
                .filter((id): id is string => Boolean(id))
        )
        remaining = remaining.filter((r) => !r.userId || !blocked.has(r.userId))
    }

    return remaining
}

// ---------------------------------------------------------------------------
// sendMail
// ---------------------------------------------------------------------------

export async function sendMail(opts: SendMailOptions): Promise<SendMailResult> {
    const result = EMPTY_RESULT()

    try {
        const { mode } = opts
        const policy = MODE_POLICY[mode.kind]
        const stream = streamFor(mode)
        const tag = opts.tag ?? defaultTagFor(mode)
        const logType = logTypeFor(mode)

        if (mode.kind === "notification" && !NOTIFICATION_TYPES[mode.type]) {
            logger.error("[email] Unknown notification type", {
                type: mode.type
            })
            return result
        }

        // Dedupe by lowercased address and drop placeholders. The archive
        // backfill invented legacy-* addresses on a domain we own, so a
        // message to one is a guaranteed bounce against our own reputation.
        const seen = new Set<string>()
        let unaddressable = 0
        let recipients = opts.recipients.filter((r) => {
            const email = r.email?.trim().toLowerCase()
            if (!email || seen.has(email)) return false
            if (isLegacyEmail(email)) {
                unaddressable++
                return false
            }
            seen.add(email)
            return true
        })
        const initial = recipients.length

        // --- policy filters -------------------------------------------------

        // An empty audience is not the end of it: a test send and a
        // directors-only send both carry their whole recipient list in
        // alwaysInclude, so the empty check has to come after the merge.
        recipients =
            initial === 0 ? [] : await applyPolicyFilters(mode, recipients)

        // Aliases and oversight copies are appended after filtering, so a
        // member-level opt-out or suppression can never remove them.
        const filteredCount = recipients.length
        const present = new Set(recipients.map((r) => r.email.toLowerCase()))
        for (const email of opts.alwaysInclude ?? []) {
            const lowered = email.trim().toLowerCase()
            if (!lowered || present.has(lowered) || isLegacyEmail(lowered)) {
                continue
            }
            present.add(lowered)
            recipients.push({ email })
        }

        if (recipients.length === 0) {
            result.skipped = unaddressable + initial
            return result
        }

        const subjectFor = (r: MailRecipient) => {
            const raw = render(opts.subject, r)
            return policy.subjectPrefix ? applyEmailSubjectPrefix(raw) : raw
        }

        // --- dedupe claim ---------------------------------------------------

        const dedupeKey =
            mode.kind === "notification" ? mode.dedupeKey : undefined

        if (dedupeKey) {
            // Claim-then-send: the partial unique index on
            // (notification_type, dedupe_key, email) makes the insert a no-op
            // for anything already claimed, so a re-run cannot double-send.
            const claimed = await db
                .insert(notificationLog)
                .values(
                    recipients.map((r) => ({
                        user_id: r.userId ?? null,
                        email: r.email.toLowerCase(),
                        mode: mode.kind,
                        notification_type: logType,
                        stream_id: stream,
                        tag,
                        subject: subjectFor(r),
                        dedupe_key: dedupeKey,
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
                result.skipped = unaddressable + initial
                return result
            }
        }

        // --- send -----------------------------------------------------------

        const from = opts.from ?? site.mailFrom

        // The unsubscribe link has to name a type the member can actually
        // toggle, so modes with no opt-outable type get no header — and
        // neither do always-included aliases, which have no user row.
        const unsubType = optOutTypeFor(mode)

        const headersFor = (r: MailRecipient) => {
            const extra = opts.headers ?? []
            const token =
                policy.unsubscribeHeader && unsubType && r.userId
                    ? createUnsubscribeToken(r.userId, unsubType)
                    : null
            if (!token) return extra.length > 0 ? extra : undefined
            return [
                ...extra,
                {
                    name: "List-Unsubscribe",
                    value: `<${buildUnsubscribeUrl(token)}>`
                },
                {
                    name: "List-Unsubscribe-Post",
                    value: "List-Unsubscribe=One-Click"
                }
            ]
        }

        let outcomes: {
            recipient: MailRecipient
            ok: boolean
            messageId: string | null
        }[]

        try {
            if (needsSingleTransport(opts, recipients.length)) {
                if (recipients.length !== 1) {
                    logger.error(
                        "[email] Attachments/fromName/inReplyTo require exactly one recipient",
                        { mode: mode.kind, count: recipients.length }
                    )
                    result.skipped = unaddressable + initial
                    return result
                }
                const r = recipients[0]
                const messageId = await sendEmail({
                    from,
                    fromName: opts.fromName,
                    to: r.email,
                    subject: subjectFor(r),
                    htmlBody: render(opts.htmlBody, r),
                    textBody: opts.textBody
                        ? render(opts.textBody, r)
                        : undefined,
                    stream,
                    tag,
                    replyTo: opts.replyTo,
                    inReplyTo: opts.inReplyTo,
                    headers: headersFor(r),
                    attachments: opts.attachments
                })
                outcomes = [{ recipient: r, ok: true, messageId }]
            } else {
                const messages: BatchEmailMessage[] = recipients.map((r) => ({
                    from,
                    to: r.email,
                    subject: subjectFor(r),
                    htmlBody: render(opts.htmlBody, r),
                    textBody: opts.textBody
                        ? render(opts.textBody, r)
                        : undefined,
                    stream,
                    tag,
                    replyTo: opts.replyTo,
                    headers: headersFor(r)
                }))
                const { results } = await sendBatchEmails(messages)
                const byEmail = new Map(
                    results.map((r) => [r.to.toLowerCase(), r] as const)
                )
                outcomes = recipients.map((r) => {
                    const res = byEmail.get(r.email.toLowerCase())
                    return {
                        recipient: r,
                        ok: res !== undefined && res.errorCode === 0,
                        messageId: res?.messageId ?? null
                    }
                })
            }
        } catch (error) {
            // The transport threw. Claimed rows would otherwise sit at
            // 'claimed' forever, permanently blocking a retry of this key.
            if (dedupeKey) {
                await markClaimedFailed(
                    logType,
                    dedupeKey,
                    recipients.map((r) => r.email.toLowerCase())
                )
            }
            throw error
        }

        for (const o of outcomes) {
            if (o.ok && o.messageId) {
                result.messageIds.set(
                    o.recipient.email.toLowerCase(),
                    o.messageId
                )
            }
        }
        result.sent = outcomes.filter((o) => o.ok).length
        result.failed = outcomes.length - result.sent
        result.skipped = unaddressable + (initial - filteredCount)

        // --- log ------------------------------------------------------------

        // Guarded separately: the mail has already gone out at this point, so
        // a logging failure must not be reported back as "nothing sent".
        try {
            await recordOutcomes()
        } catch (error) {
            logger.error("[email] Could not record send", {
                mode: mode.kind,
                type: logType,
                error: error instanceof Error ? error.message : String(error)
            })
        }

        async function recordOutcomes() {
            if (dedupeKey) {
                // Rows already exist from the claim; update each so the Postmark
                // id is preserved per recipient (bounce correlation needs it).
                for (const o of outcomes) {
                    await db
                        .update(notificationLog)
                        .set({
                            status: o.ok ? "sent" : "failed",
                            postmark_message_id: o.messageId
                        })
                        .where(
                            and(
                                eq(notificationLog.notification_type, logType),
                                eq(notificationLog.dedupe_key, dedupeKey),
                                eq(
                                    notificationLog.email,
                                    o.recipient.email.toLowerCase()
                                )
                            )
                        )
                }
            } else {
                await db.insert(notificationLog).values(
                    outcomes.map((o) => ({
                        user_id: o.recipient.userId ?? null,
                        email: o.recipient.email.toLowerCase(),
                        mode: mode.kind,
                        notification_type: logType,
                        stream_id: stream,
                        tag,
                        subject: subjectFor(o.recipient),
                        status: o.ok ? "sent" : "failed",
                        postmark_message_id: o.messageId,
                        broadcast_id:
                            mode.kind === "broadcast" ? mode.broadcastId : null
                    }))
                )
            }
        }

        if (result.skipped > 0 || result.failed > 0) {
            logger.info("[email] Send complete", {
                mode: mode.kind,
                type: logType,
                sent: result.sent,
                failed: result.failed,
                skipped: result.skipped
            })
        }
        return result
    } catch (error) {
        logger.error("[email] Send failed", {
            mode: opts.mode.kind,
            type: logTypeFor(opts.mode),
            error: error instanceof Error ? error.message : String(error)
        })
        return { ...EMPTY_RESULT(), skipped: opts.recipients.length }
    }
}

async function markClaimedFailed(
    logType: string,
    dedupeKey: string,
    emails: string[]
): Promise<void> {
    try {
        await db
            .update(notificationLog)
            .set({ status: "failed" })
            .where(
                and(
                    eq(notificationLog.notification_type, logType),
                    eq(notificationLog.dedupe_key, dedupeKey),
                    inArray(notificationLog.email, emails)
                )
            )
    } catch (error) {
        logger.error("[email] Could not release claimed rows", {
            dedupeKey,
            error: error instanceof Error ? error.message : String(error)
        })
    }
}

export function buildUnsubscribeUrl(token: string): string {
    return `${site.publicUrl}/api/email/unsubscribe?token=${encodeURIComponent(token)}`
}
