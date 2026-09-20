/**
 * Vercel Cron endpoint: daily survey reminders.
 *
 * Scheduled in vercel.json (15:30 UTC, just after the game-reminders run).
 * Vercel invokes it with `Authorization: Bearer ${CRON_SECRET}`; anything
 * else is rejected. Closes expired surveys first so this run's due-selection
 * never reminds a survey that just passed its deadline, then sends one round
 * of reminders to every survey whose cadence is due. Safe to re-run: the
 * per-round dedupe key in notification_log makes repeat sends no-ops.
 */

import { timingSafeEqual } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import { autoCloseExpiredSurveys } from "@/lib/surveys/lifecycle"
import { sendDueSurveyReminders } from "@/lib/surveys/reminders"

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

    const now = new Date()
    const closed = await autoCloseExpiredSurveys(now)
    const result = await sendDueSurveyReminders(now)
    logger.info("[cron] Survey reminders run", { closed, ...result })
    return NextResponse.json({ ...result, closed })
}
