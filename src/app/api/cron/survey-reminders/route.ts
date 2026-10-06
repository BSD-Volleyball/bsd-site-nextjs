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

import { type NextRequest, NextResponse } from "next/server"
import { isAuthorizedCronRequest } from "@/lib/cron-auth"
import { logger } from "@/lib/logger"
import { autoCloseExpiredSurveys } from "@/lib/surveys/lifecycle"
import { sendDueSurveyReminders } from "@/lib/surveys/reminders"

export const maxDuration = 300

export async function GET(request: NextRequest) {
    if (!isAuthorizedCronRequest(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()
    const closed = await autoCloseExpiredSurveys(now)
    const result = await sendDueSurveyReminders(now)
    logger.info("[cron] Survey reminders run", { closed, ...result })
    return NextResponse.json({ ...result, closed })
}
