/**
 * Vercel Cron endpoint: nightly retention prune.
 *
 * Trims notification_log and audit_log to the shared one-year window.
 * Scheduled in vercel.json (daily 09:00 UTC, away from the 15:00 reminder
 * runs so a slow prune cannot delay mail). Vercel invokes it with
 * `Authorization: Bearer ${CRON_SECRET}`; anything else is rejected. Safe to
 * re-run — a second run the same day finds nothing left to delete.
 *
 * The path still says notification-log for continuity with the cron already
 * registered in vercel.json; renaming it would silently drop the schedule
 * until the next deploy re-registered it.
 */

import { type NextRequest, NextResponse } from "next/server"
import { isAuthorizedCronRequest } from "@/lib/cron-auth"
import { logger } from "@/lib/logger"
import { pruneExpiredRecords } from "@/lib/retention"

export const maxDuration = 300

export async function GET(request: NextRequest) {
    if (!isAuthorizedCronRequest(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await pruneExpiredRecords()
    logger.info("[cron] Retention prune run", {
        cutoff: result.cutoff,
        notificationsDeleted: result.notificationLog.deleted,
        auditDeleted: result.auditLog.deleted
    })
    return NextResponse.json(result)
}
