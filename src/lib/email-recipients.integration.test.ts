import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { notificationOptouts } from "@/database/schema"
import { createUser } from "@/test/session"
import { filterByNotificationPreference } from "./email-recipients"

describe("filterByNotificationPreference", () => {
    it("drops recipients who opted out of the type, keeps the rest", async () => {
        const optedOut = await createUser()
        const optedIn = await createUser()
        await db.insert(notificationOptouts).values({
            user_id: optedOut.id,
            notification_type: "league_announcements"
        })

        const toRecipient = (u: { id: string; email: string }) => ({
            userId: u.id,
            email: u.email,
            firstName: "T",
            lastName: "U"
        })

        const result = await filterByNotificationPreference(
            [toRecipient(optedOut), toRecipient(optedIn)],
            "league_announcements"
        )
        expect(result.map((r) => r.userId)).toEqual([optedIn.id])

        // A different type is unaffected by the opt-out.
        const other = await filterByNotificationPreference(
            [toRecipient(optedOut)],
            "in_season_updates"
        )
        expect(other).toHaveLength(1)
    })
})
