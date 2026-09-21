/**
 * Day-before admin coverage digest.
 *
 * One dispatch per match night, keyed by date so a re-run of the cron is a
 * no-op. Recipients are the admin role holders plus any leadership_group
 * member who counts toward that night's coverage (added present for at least
 * one slot); leadership members who merely play or ref appear in the body but
 * are not mailed.
 */

import { site } from "@/config/site"
import { coverageDateTitle, formatCoverageDate } from "@/lib/coverage/format"
import { loadCoverage } from "@/lib/coverage/load"
import type { CoverageDate, CoverageStatus } from "@/lib/coverage/types"
import { buildCoverageDigestHtml } from "@/lib/email-html"
import { logger } from "@/lib/logger"
import { getRecipientsWithRole } from "@/lib/rbac"
import { buildScoreSheetsPdfBytes } from "@/lib/scoresheets/generate"
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

/** Admins, plus leadership members covering at least one slot that night. */
async function coverageDigestRecipients(day: CoverageDate) {
    const coveringLeadership = new Set(
        day.slots.flatMap((s) =>
            s.people
                .filter((p) => p.isLeadership && p.counts)
                .map((p) => p.userId)
        )
    )
    const [admins, leadership] = await Promise.all([
        getRecipientsWithRole("admin"),
        coveringLeadership.size > 0
            ? getRecipientsWithRole("leadership_group")
            : Promise.resolve([])
    ])
    const seen = new Set(admins.map((a) => a.userId))
    const extra = leadership.filter(
        (l) => coveringLeadership.has(l.userId) && !seen.has(l.userId)
    )
    return [...admins, ...extra]
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
    if (!day || day.matchCount === 0) return result
    result.status = day.status

    const recipients = await coverageDigestRecipients(day)
    if (recipients.length === 0) return result

    // The printable sheets ride along so whoever opens the gym can print
    // them straight from the email. A failure here must not stop the digest:
    // the coverage information is the point, the attachment is a convenience.
    let scoreSheets: { bytes: Uint8Array; fileName: string } | null = null
    try {
        scoreSheets = await buildScoreSheetsPdfBytes(date)
    } catch (error) {
        logger.error("[coverage-digest] Score sheet build failed", {
            date,
            error: error instanceof Error ? error.message : String(error)
        })
    }

    const coverageUrl = `${site.url}/dashboard/coverage`
    const dispatched = await dispatchNotification({
        type: "coverage_digest",
        recipients,
        subject: coverageDigestSubject(day),
        htmlBody: (r) =>
            buildCoverageDigestHtml({
                firstName: r.firstName ?? "there",
                day,
                coverageUrl,
                hasScoreSheets: scoreSheets !== null
            }),
        tag: "coverage-digest",
        dedupeKey: `coverage-${date}`,
        attachments: scoreSheets
            ? [
                  {
                      name: scoreSheets.fileName,
                      content: Buffer.from(scoreSheets.bytes).toString(
                          "base64"
                      ),
                      contentType: "application/pdf"
                  }
              ]
            : undefined
    })
    result.sent = dispatched.sent
    result.failed = dispatched.failed
    result.skipped = dispatched.skipped
    return result
}
