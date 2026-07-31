import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { notificationOptouts } from "@/database/schema"
import { createUser } from "@/test/session"
import {
    ensureRecipientGroup,
    filterByNotificationPreference,
    getRecipientsForGroup
} from "./email-recipients"

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

describe("getRecipientsForGroup", () => {
    it("excludes legacy placeholder accounts from a recipient group", async () => {
        // The archive backfill invented these addresses, so they can never
        // receive mail. Dropping them at query time (not just at send time)
        // keeps the recipient count an admin sees equal to what goes out.
        const real = await createUser()
        const legacy = await createUser({
            email: `legacy-roster-jane-doe-f07-1-${crypto
                .randomUUID()
                .slice(0, 8)}@bumpsetdrink.com`
        })

        const groupId = await ensureRecipientGroup("all_users", {
            name: "All Users"
        })
        const recipients = await getRecipientsForGroup(groupId)
        const ids = recipients.map((r) => r.userId)

        expect(ids).toContain(real.id)
        expect(ids).not.toContain(legacy.id)
        expect(recipients.some((r) => r.email.startsWith("legacy-"))).toBe(
            false
        )
    })
})
