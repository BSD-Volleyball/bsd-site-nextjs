import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { notificationOptouts } from "@/database/schema"
import { sendBatchEmails } from "@/lib/postmark"
import { createSeason } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { sendWeek1RosterNotifications } from "./actions"

const mockedSendBatch = vi.mocked(sendBatchEmails)

describe("sendWeek1RosterNotifications", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("requires admin access", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await sendWeek1RosterNotifications(
            [{ userId: "x", sessionNumber: 1, courtNumber: 1 }],
            [],
            "Fall 2026"
        )
        expect(result.status).toBe(false)
    })

    it("sends assignment and removal emails, skipping opted-out players", async () => {
        await createSeason()
        const assigned = await createUser()
        const optedOut = await createUser()
        const removed = await createUser()
        await db.insert(notificationOptouts).values({
            user_id: optedOut.id,
            notification_type: "tryout_roster"
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await sendWeek1RosterNotifications(
            [
                { userId: assigned.id, sessionNumber: 1, courtNumber: 2 },
                { userId: optedOut.id, sessionNumber: 2, courtNumber: 3 }
            ],
            [removed.id],
            "Fall 2026"
        )

        expect(result.status).toBe(true)
        expect(result.status && result.message).toContain("2 notification(s)")
        expect(result.status && result.message).toContain("1 skipped")

        const sentTo = mockedSendBatch.mock.calls.flatMap((call) =>
            call[0].map((m) => m.to)
        )
        expect(sentTo).toContain(assigned.email)
        expect(sentTo).toContain(removed.email)
        expect(sentTo).not.toContain(optedOut.email)
    })
})
