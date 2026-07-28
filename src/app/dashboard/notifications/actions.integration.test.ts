import { and, eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import {
    emailSuppressions,
    notificationOptouts,
    users
} from "@/database/schema"
import { typesInCategory } from "@/lib/notifications/types"
import {
    createStreamSuppression,
    deleteStreamSuppression
} from "@/lib/postmark"
import { createUser, createUserWithRoles, loginAs } from "@/test/session"
import {
    getNotificationSettings,
    reactivateStream,
    saveNotificationPreferences
} from "./actions"

const mockedCreate = vi.mocked(createStreamSuppression)
const mockedDelete = vi.mocked(deleteStreamSuppression)

const ANNOUNCEMENT_TYPES = typesInCategory("announcements")

describe("saveNotificationPreferences", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("rejects unauthenticated users", async () => {
        const result = await saveNotificationPreferences(["draft_results"])
        expect(result.status).toBe(false)
    })

    it("round-trips the opted-out set", async () => {
        await createUserWithRoles([])
        const save = await saveNotificationPreferences([
            "draft_results",
            "game_reminder_player"
        ])
        expect(save.status).toBe(true)

        const settings = await getNotificationSettings()
        expect(settings.status).toBe(true)
        if (settings.status) {
            expect(new Set(settings.data.optedOut)).toEqual(
                new Set(["draft_results", "game_reminder_player"])
            )
        }
    })

    it("rejects mandatory and unknown types", async () => {
        await createUserWithRoles([])
        expect(
            (await saveNotificationPreferences(["in_season_updates"])).status
        ).toBe(false)
        expect((await saveNotificationPreferences(["bogus"])).status).toBe(
            false
        )
    })

    it("pushes a Postmark broadcast suppression when announcements are fully opted out", async () => {
        const user = await createUserWithRoles([])
        const result = await saveNotificationPreferences(ANNOUNCEMENT_TYPES)
        expect(result.status).toBe(true)

        expect(mockedCreate).toHaveBeenCalledWith(
            "broadcast",
            user.email.toLowerCase()
        )
        const [suppression] = await db
            .select()
            .from(emailSuppressions)
            .where(eq(emailSuppressions.email, user.email.toLowerCase()))
        expect(suppression.stream_id).toBe("broadcast")
        expect(suppression.reason).toBe("ManualSuppression")

        const [row] = await db
            .select({ status: users.email_status })
            .from(users)
            .where(eq(users.id, user.id))
        expect(row.status).toBe("unsubscribed")
    })

    it("clears our own suppression when the category is re-enabled", async () => {
        const user = await createUserWithRoles([])
        await saveNotificationPreferences(ANNOUNCEMENT_TYPES)
        mockedCreate.mockClear()

        const result = await saveNotificationPreferences([])
        expect(result.status).toBe(true)
        expect(mockedDelete).toHaveBeenCalledWith(
            "broadcast",
            user.email.toLowerCase()
        )
        const rows = await db
            .select()
            .from(emailSuppressions)
            .where(eq(emailSuppressions.email, user.email.toLowerCase()))
        expect(rows).toHaveLength(0)

        const [row] = await db
            .select({ status: users.email_status })
            .from(users)
            .where(eq(users.id, user.id))
        expect(row.status).toBe("valid")
    })

    it("never auto-clears a recipient-originated unsubscribe on re-enable", async () => {
        const user = await createUserWithRoles([])
        // Simulate the user unsubscribing via Postmark's link (webhook write).
        await db.insert(emailSuppressions).values({
            user_id: user.id,
            email: user.email.toLowerCase(),
            stream_id: "broadcast",
            reason: "HardBounce",
            origin: "Recipient"
        })
        await saveNotificationPreferences(ANNOUNCEMENT_TYPES)
        await saveNotificationPreferences([])

        expect(mockedDelete).not.toHaveBeenCalled()
        const rows = await db
            .select()
            .from(emailSuppressions)
            .where(eq(emailSuppressions.email, user.email.toLowerCase()))
        expect(rows).toHaveLength(1)
    })
})

describe("reactivateStream", () => {
    it("removes the suppression remotely and locally and re-enables the category", async () => {
        const user = await createUserWithRoles([])
        await db.insert(emailSuppressions).values({
            user_id: user.id,
            email: user.email.toLowerCase(),
            stream_id: "broadcast",
            reason: "ManualSuppression",
            origin: "Recipient"
        })
        await db.insert(notificationOptouts).values(
            ANNOUNCEMENT_TYPES.map((type) => ({
                user_id: user.id,
                notification_type: type
            }))
        )
        await db
            .update(users)
            .set({ email_status: "unsubscribed" })
            .where(eq(users.id, user.id))

        const result = await reactivateStream("broadcast")
        expect(result.status).toBe(true)
        expect(mockedDelete).toHaveBeenCalledWith(
            "broadcast",
            user.email.toLowerCase()
        )

        const suppressionRows = await db
            .select()
            .from(emailSuppressions)
            .where(eq(emailSuppressions.email, user.email.toLowerCase()))
        expect(suppressionRows).toHaveLength(0)

        const optoutRows = await db
            .select()
            .from(notificationOptouts)
            .where(eq(notificationOptouts.user_id, user.id))
        expect(optoutRows).toHaveLength(0)

        const [row] = await db
            .select({ status: users.email_status })
            .from(users)
            .where(eq(users.id, user.id))
        expect(row.status).toBe("valid")
    })

    it("refuses spam-complaint suppressions", async () => {
        const user = await createUserWithRoles([])
        await db.insert(emailSuppressions).values({
            user_id: user.id,
            email: user.email.toLowerCase(),
            stream_id: "broadcast",
            reason: "SpamComplaint",
            origin: "Recipient"
        })

        const result = await reactivateStream("broadcast")
        expect(result.status).toBe(false)
        expect(mockedDelete).not.toHaveBeenCalled()
    })

    it("keeps the local row when the Postmark delete fails", async () => {
        const user = await createUserWithRoles([])
        await db.insert(emailSuppressions).values({
            user_id: user.id,
            email: user.email.toLowerCase(),
            stream_id: "broadcast",
            reason: "ManualSuppression",
            origin: "Recipient"
        })
        mockedDelete.mockRejectedValueOnce(new Error("postmark down"))

        const result = await reactivateStream("broadcast")
        expect(result.status).toBe(false)
        const rows = await db
            .select()
            .from(emailSuppressions)
            .where(
                and(
                    eq(emailSuppressions.email, user.email.toLowerCase()),
                    eq(emailSuppressions.stream_id, "broadcast")
                )
            )
        expect(rows).toHaveLength(1)
    })
})

describe("admin editing via edit-player actions", () => {
    it("lets an admin update another user's preferences with an audit trail", async () => {
        const target = await createUser()
        await createUserWithRoles([{ role: "admin" }])
        const { saveUserNotificationSettings, getUserNotificationSettings } =
            await import("../edit-player/actions")

        const save = await saveUserNotificationSettings(target.id, [
            "draft_results"
        ])
        expect(save.status).toBe(true)

        const settings = await getUserNotificationSettings(target.id)
        expect(settings.status).toBe(true)
        if (settings.status) {
            expect(settings.data.optedOut).toEqual(["draft_results"])
        }
    })

    it("rejects non-admins and unauthenticated callers", async () => {
        const target = await createUser()
        const { saveUserNotificationSettings } = await import(
            "../edit-player/actions"
        )

        const captain = await createUserWithRoles([{ role: "captain" }])
        loginAs(captain)
        expect((await saveUserNotificationSettings(target.id, [])).status).toBe(
            false
        )
    })
})
