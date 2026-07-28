/**
 * Vercel Cron endpoint: day-before game reminders.
 *
 * Scheduled in vercel.json (daily 15:00 UTC ≈ 10/11am league time). Vercel
 * invokes it with `Authorization: Bearer ${CRON_SECRET}`; anything else is
 * rejected. Safe to re-run — per-match dedupe keys in notification_log make
 * repeat sends no-ops.
 */

import { timingSafeEqual } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { getLeagueDateString } from "@/lib/date-utils"
import { logger } from "@/lib/logger"
import { sendGameRemindersForDate } from "@/lib/notifications/game-reminders"

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

    const tomorrow = getLeagueDateString(1)
    const result = await sendGameRemindersForDate(tomorrow)
    logger.info("[cron] Game reminders run", { ...result })
    return NextResponse.json(result)
}
