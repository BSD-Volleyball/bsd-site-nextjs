/**
 * Client-safe presentation helpers for email deliverability state.
 *
 * Two related things get surfaced together in admin views:
 *   - `users.email_status` — the rolled-up worst state across every stream,
 *     derived by recomputeEmailStatus() in notifications/suppressions.ts.
 *   - `email_suppressions` rows — the per-stream detail explaining it.
 *
 * A player can be suppressed on one stream (say broadcasts) while still
 * receiving others (receipts), which is why the detail matters.
 */

/** Values stored in users.email_status. */
export const EMAIL_STATUS_LABELS: Record<string, string> = {
    valid: "Deliverable",
    unsubscribed: "Unsubscribed",
    bounced: "Bounced",
    spam_complaint: "Spam complaint"
}

export const EMAIL_STATUS_BADGE_COLORS: Record<string, string> = {
    valid: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
    unsubscribed:
        "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    bounced: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    spam_complaint: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
}

/** Whether this status means we are no longer reaching the player at all. */
export function isEmailStatusBlocking(status: string): boolean {
    return status === "bounced" || status === "spam_complaint"
}

export function emailStatusLabel(status: string): string {
    return EMAIL_STATUS_LABELS[status] ?? status
}

export function emailStatusBadgeColor(status: string): string {
    return EMAIL_STATUS_BADGE_COLORS[status] ?? "bg-muted text-muted-foreground"
}

/** Values stored in email_suppressions.reason (Postmark's vocabulary). */
const SUPPRESSION_REASON_LABELS: Record<string, string> = {
    HardBounce: "Hard bounce",
    SpamComplaint: "Spam complaint",
    ManualSuppression: "Unsubscribed"
}

export function suppressionReasonLabel(reason: string): string {
    return SUPPRESSION_REASON_LABELS[reason] ?? reason
}

/**
 * Who caused the suppression. Postmark's "Customer" means us — an API call
 * from this app (the Notifications preference page) — so it is relabelled to
 * avoid reading as "the league's customer".
 */
const SUPPRESSION_ORIGIN_LABELS: Record<string, string> = {
    Recipient: "by the recipient",
    Customer: "via their notification preferences",
    Admin: "by an admin"
}

export function suppressionOriginLabel(origin: string): string {
    return SUPPRESSION_ORIGIN_LABELS[origin] ?? origin
}

/**
 * Plain-language explanation of one suppression, e.g.
 * "Hard bounce — the address rejected our mail permanently."
 */
export function suppressionExplanation(reason: string): string {
    switch (reason) {
        case "HardBounce":
            return "The address rejected our mail permanently. Nothing will be delivered until it is fixed and reactivated."
        case "SpamComplaint":
            return "The recipient marked our mail as spam. Postmark will not allow reactivation."
        case "ManualSuppression":
            return "Opted out of this stream. They can re-enable it from their Notifications page."
        default:
            return ""
    }
}
