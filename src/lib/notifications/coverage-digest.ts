/**
 * Day-before admin coverage digest.
 *
 * One dispatch per match night, keyed by date so a re-run of the cron and the
 * "Send digest now" button share one idempotent path. Recipients are the admin
 * role holders; leadership members appear in the body but are not mailed.
 */

import { site } from "@/config/site"
import { coverageDateTitle, formatCoverageDate } from "@/lib/coverage/format"
import { loadCoverage } from "@/lib/coverage/load"
import type { CoverageDate, CoverageStatus } from "@/lib/coverage/types"
import { buildCoverageDigestHtml } from "@/lib/email-html"
import { getRecipientsWithRole } from "@/lib/rbac"
import { dispatchNotification } from "./dispatch"

export interface CoverageDigestRunResult {
    date: string
    status: CoverageStatus | null
    sent: number
    failed: number
    skipped: number
}

export function coverageDigestSubject(day: CoverageDate): string {
    const prefix =
        day.status === "green" ? "" : `[${day.status.toUpperCase()}] `
    return `${prefix}Coverage for ${formatCoverageDate(day.date)} (${coverageDateTitle(day)}): ${day.reason}`
}

export async function sendCoverageDigestForDate(
    date: string
): Promise<CoverageDigestRunResult> {
    const result: CoverageDigestRunResult = {
        date,
        status: null,
        sent: 0,
        failed: 0,
        skipped: 0
    }
    const [day] = await loadCoverage({ fromDate: date, toDate: date })
    if (!day) return result
    result.status = day.status

    const recipients = await getRecipientsWithRole("admin")
    if (recipients.length === 0) return result

    const coverageUrl = `${site.url}/dashboard/coverage`
    const dispatched = await dispatchNotification({
        type: "coverage_digest",
        recipients,
        subject: coverageDigestSubject(day),
        htmlBody: (r) =>
            buildCoverageDigestHtml({
                firstName: r.firstName ?? "there",
                day,
                coverageUrl
            }),
        tag: "coverage-digest",
        dedupeKey: `coverage-${date}`
    })
    result.sent = dispatched.sent
    result.failed = dispatched.failed
    result.skipped = dispatched.skipped
    return result
}
