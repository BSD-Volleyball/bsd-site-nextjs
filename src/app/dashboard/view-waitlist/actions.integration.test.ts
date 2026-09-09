import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { waitlist } from "@/database/schema"
import {
    addToWaitlist,
    createSeason,
    seedBaselineSeason
} from "@/test/factories"
import { sentMessages } from "@/test/email"
import { createUser, createUserWithRoles, logout } from "@/test/session"
import { setWaitlistApproval } from "./actions"

describe("setWaitlistApproval notification", () => {
    let seasonId: number
    let player: Awaited<ReturnType<typeof createUser>>
    let waitlistId: number

    beforeEach(async () => {
        await seedBaselineSeason()
        seasonId = (
            await createSeason({
                season_amount: "90.00",
                late_amount: "100.00"
            })
        ).id
        await createUserWithRoles([{ role: "admin" }])
        player = await createUser({ first_name: "Dana" })
        waitlistId = (
            await addToWaitlist({ season: seasonId, user: player.id })
        ).id
    })

    it("emails the player when they are approved", async () => {
        const result = await setWaitlistApproval(waitlistId, true)
        expect(result.status).toBe(true)

        const mail = sentMessages().filter(
            (m) => m.to.toLowerCase() === player.email.toLowerCase()
        )
        expect(mail).toHaveLength(1)
        expect(mail[0].subject).toContain("A spot opened up")
        expect(mail[0].htmlBody).toContain("Dana")
        expect(mail[0].htmlBody).toContain("/dashboard/pay-season")
        expect(mail[0].tag).toBe("waitlist-approved")
    })

    it("does not email when approval is revoked", async () => {
        await db
            .update(waitlist)
            .set({ approved: true })
            .where(eq(waitlist.id, waitlistId))

        const result = await setWaitlistApproval(waitlistId, false)
        expect(result.status).toBe(true)
        expect(sentMessages()).toHaveLength(0)
    })

    it("sends only once when approval is toggled off and back on", async () => {
        await setWaitlistApproval(waitlistId, true)
        await setWaitlistApproval(waitlistId, false)
        await setWaitlistApproval(waitlistId, true)

        const mail = sentMessages().filter(
            (m) => m.to.toLowerCase() === player.email.toLowerCase()
        )
        expect(mail).toHaveLength(1)
    })

    it("still records the approval", async () => {
        await setWaitlistApproval(waitlistId, true)
        const [row] = await db
            .select({ approved: waitlist.approved })
            .from(waitlist)
            .where(eq(waitlist.id, waitlistId))
        expect(row.approved).toBe(true)
    })

    it("rejects non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        expect(await setWaitlistApproval(waitlistId, true)).toEqual({
            status: false,
            message: "Unauthorized."
        })

        await logout()
        expect(await setWaitlistApproval(waitlistId, true)).toEqual({
            status: false,
            message: "Unauthorized."
        })
        expect(sentMessages()).toHaveLength(0)
    })
})
