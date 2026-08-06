import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { db } from "@/database/db"
import { auditLog, notificationLog } from "@/database/schema"
import { createUser } from "@/test/session"

import {
    RETENTION_DAYS,
    pruneAuditLog,
    pruneExpiredRecords,
    pruneNotificationLog,
    retentionCutoff
} from "@/lib/retention"

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
            daysBefore(NOW, RETENTION_DAYS).toISOString()
        )
    })
})

async function auditRow(userId: string, createdAt: Date) {
    const [row] = await db
        .insert(auditLog)
        .values({
            user: userId,
            action: "update",
            entity_type: "season",
            entity_id: "1",
            summary: "Changed something",
            created_at: createdAt
        })
        .returning({ id: auditLog.id })
    return row.id
}

describe("pruneNotificationLog", () => {
    it("removes rows older than the window and keeps the rest", async () => {
        const user = await createUser()
        const stale = await logRow(
            "old@example.test",
            daysBefore(NOW, RETENTION_DAYS + 1),
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
        await logRow("edge@example.test", daysBefore(NOW, RETENTION_DAYS - 1))

        const result = await pruneNotificationLog({ now: NOW })

        expect(result.deleted).toBe(0)
        expect(await db.select().from(notificationLog)).toHaveLength(1)
    })

    it("deletes across several batches", async () => {
        const old = daysBefore(NOW, RETENTION_DAYS + 5)
        for (let i = 0; i < 5; i++) {
            await logRow(`bulk-${i}@example.test`, old)
        }

        const result = await pruneNotificationLog({ now: NOW, batchSize: 2 })

        expect(result.deleted).toBe(5)
        expect(result.truncated).toBe(false)
        expect(await db.select().from(notificationLog)).toHaveLength(0)
    })

    it("is a no-op on a second run the same day", async () => {
        await logRow("old@example.test", daysBefore(NOW, RETENTION_DAYS + 1))

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
            created_at: daysBefore(NOW, RETENTION_DAYS + 10)
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

describe("pruneAuditLog", () => {
    it("removes entries older than the window and keeps the rest", async () => {
        const admin = await createUser()
        const stale = await auditRow(
            admin.id,
            daysBefore(NOW, RETENTION_DAYS + 1)
        )
        const fresh = await auditRow(admin.id, daysBefore(NOW, 200))

        const result = await pruneAuditLog({ now: NOW })

        expect(result.deleted).toBe(1)
        const remaining = await db.select().from(auditLog)
        expect(remaining.map((r) => r.id)).toEqual([fresh])
        expect(remaining.map((r) => r.id)).not.toContain(stale)
    })

    it("keeps an entry one day inside the window", async () => {
        const admin = await createUser()
        await auditRow(admin.id, daysBefore(NOW, RETENTION_DAYS - 1))

        const result = await pruneAuditLog({ now: NOW })

        expect(result.deleted).toBe(0)
        expect(await db.select().from(auditLog)).toHaveLength(1)
    })

    it("deletes across several batches", async () => {
        const admin = await createUser()
        const old = daysBefore(NOW, RETENTION_DAYS + 5)
        for (let i = 0; i < 5; i++) await auditRow(admin.id, old)

        const result = await pruneAuditLog({ now: NOW, batchSize: 2 })

        expect(result.deleted).toBe(5)
        expect(result.truncated).toBe(false)
        expect(await db.select().from(auditLog)).toHaveLength(0)
    })
})

describe("pruneExpiredRecords", () => {
    it("prunes both tables in one run, to the same cutoff", async () => {
        const admin = await createUser()
        const old = daysBefore(NOW, RETENTION_DAYS + 2)
        await logRow("old@example.test", old, admin.id)
        await auditRow(admin.id, old)
        await logRow("new@example.test", daysBefore(NOW, 10), admin.id)
        await auditRow(admin.id, daysBefore(NOW, 10))

        const result = await pruneExpiredRecords({ now: NOW })

        expect(result.cutoff).toBe(retentionCutoff(NOW).toISOString())
        expect(result.notificationLog.deleted).toBe(1)
        expect(result.auditLog.deleted).toBe(1)
        expect(await db.select().from(notificationLog)).toHaveLength(1)
        expect(await db.select().from(auditLog)).toHaveLength(1)
    })

    it("is a no-op on a second run the same day", async () => {
        const admin = await createUser()
        const old = daysBefore(NOW, RETENTION_DAYS + 2)
        await logRow("old@example.test", old, admin.id)
        await auditRow(admin.id, old)

        await pruneExpiredRecords({ now: NOW })
        const second = await pruneExpiredRecords({ now: NOW })

        expect(second.notificationLog.deleted).toBe(0)
        expect(second.auditLog.deleted).toBe(0)
    })
})
