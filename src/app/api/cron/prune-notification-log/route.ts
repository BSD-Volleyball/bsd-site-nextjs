/**
 * Vercel Cron endpoint: nightly notification_log retention prune.
 *
 * Scheduled in vercel.json (daily 09:00 UTC, away from the 15:00 reminder
 * runs so a slow prune cannot delay mail). Vercel invokes it with
 * `Authorization: Bearer ${CRON_SECRET}`; anything else is rejected. Safe to
 * re-run — a second run the same day finds nothing left to delete.
 */

import { timingSafeEqual } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import { pruneNotificationLog } from "@/lib/notifications/log-retention"

export const maxDuration = 300

function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret) return false
    const provided = Buffer.from(request.headers.get("authorization") ?? "")
    const expected = Buffer.from(`Bearer ${secret}`)
    return (
        provided.length === expected.length &&
        timingSafeEqual(provided, expected)
    )
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await pruneNotificationLog()
    logger.info("[cron] Notification log prune run", { ...result })
    return NextResponse.json(result)
}
