import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { db } from "@/database/db"
import { notificationLog } from "@/database/schema"
import { createUser } from "@/test/session"

import {
    pruneNotificationLog,
    retentionCutoff
} from "@/lib/notifications/log-retention"
import { NOTIFICATION_LOG_RETENTION_DAYS } from "@/lib/notifications/types"

const NOW = new Date("2026-08-05T12:00:00Z")

function daysBefore(reference: Date, days: number) {
    const d = new Date(reference)
    d.setUTCDate(d.getUTCDate() - days)
    return d
}

async function logRow(email: string, createdAt: Date, userId?: string) {
    const [row] = await db
        .insert(notificationLog)
        .values({
            user_id: userId ?? null,
            email,
            mode: "notification",
            notification_type: "league_announcements",
            stream_id: "broadcast",
            subject: "[BSD] News",
            status: "sent",
            created_at: createdAt
        })
        .returning({ id: notificationLog.id })
    return row.id
}

describe("retentionCutoff", () => {
    it("is exactly the retention window before now", () => {
        const cutoff = retentionCutoff(NOW)
        expect(cutoff.toISOString()).toBe(
            daysBefore(NOW, NOTIFICATION_LOG_RETENTION_DAYS).toISOString()
        )
    })
})

describe("pruneNotificationLog", () => {
    it("removes rows older than the window and keeps the rest", async () => {
        const user = await createUser()
        const stale = await logRow(
            "old@example.test",
            daysBefore(NOW, NOTIFICATION_LOG_RETENTION_DAYS + 1),
            user.id
        )
        const fresh = await logRow(
            "new@example.test",
            daysBefore(NOW, 30),
            user.id
        )

        const result = await pruneNotificationLog({ now: NOW })

        expect(result.deleted).toBe(1)
        expect(result.truncated).toBe(false)

        const remaining = await db.select().from(notificationLog)
        expect(remaining.map((r) => r.id)).toEqual([fresh])
        expect(remaining.map((r) => r.id)).not.toContain(stale)
    })

    // Off-by-one here would either keep rows a day too long or delete a day
    // of history early; neither is loud, so pin the boundary.
    it("keeps a row that is one day inside the window", async () => {
        await logRow(
            "edge@example.test",
            daysBefore(NOW, NOTIFICATION_LOG_RETENTION_DAYS - 1)
        )

        const result = await pruneNotificationLog({ now: NOW })

        expect(result.deleted).toBe(0)
        expect(await db.select().from(notificationLog)).toHaveLength(1)
    })

    it("deletes across several batches", async () => {
        const old = daysBefore(NOW, NOTIFICATION_LOG_RETENTION_DAYS + 5)
        for (let i = 0; i < 5; i++) {
            await logRow(`bulk-${i}@example.test`, old)
        }

        const result = await pruneNotificationLog({ now: NOW, batchSize: 2 })

        expect(result.deleted).toBe(5)
        expect(result.truncated).toBe(false)
        expect(await db.select().from(notificationLog)).toHaveLength(0)
    })

    it("is a no-op on a second run the same day", async () => {
        await logRow(
            "old@example.test",
            daysBefore(NOW, NOTIFICATION_LOG_RETENTION_DAYS + 1)
        )

        await pruneNotificationLog({ now: NOW })
        const second = await pruneNotificationLog({ now: NOW })

        expect(second.deleted).toBe(0)
    })

    it("prunes claimed rows too, since their dedupe keys can never recur", async () => {
        // Dedupe keys embed the date they were issued for, so a year-old key
        // is unreachable and its row is safe to remove.
        await db.insert(notificationLog).values({
            email: "stuck@example.test",
            mode: "notification",
            notification_type: "game_reminder_player",
            stream_id: "automated-reminders",
            subject: "[BSD] Match reminder",
            dedupe_key: "match-1-2025-01-01",
            status: "claimed",
            created_at: daysBefore(NOW, NOTIFICATION_LOG_RETENTION_DAYS + 10)
        })

        const result = await pruneNotificationLog({ now: NOW })

        expect(result.deleted).toBe(1)
        expect(
            await db
                .select()
                .from(notificationLog)
                .where(eq(notificationLog.status, "claimed"))
        ).toHaveLength(0)
    })
})
