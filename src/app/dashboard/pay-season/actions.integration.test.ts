import { and, eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import {
    discounts,
    signups,
    waitlist,
    waiverAcceptances
} from "@/database/schema"
import { sendEmail } from "@/lib/postmark"
import {
    addToWaitlist,
    createDiscount,
    createSeason,
    createSignup,
    createWaiver,
    seedBaselineSeason
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { submitFreeSignup, submitSeasonPayment } from "./actions"

// Both payment actions build a SquareClient locally, so mocking the SDK
// constructor is the single seam. paymentsCreate is configured per test.
const { paymentsCreate } = vi.hoisted(() => ({ paymentsCreate: vi.fn() }))
vi.mock("square", () => ({
    SquareClient: class {
        payments = { create: paymentsCreate }
    },
    SquareEnvironment: { Production: "production", Sandbox: "sandbox" }
}))

const formData = {
    age: "30",
    captain: "no",
    pair: false,
    pairPick: null,
    pairReason: "",
    unavailableEventIds: [] as number[]
}

describe("submitSeasonPayment", () => {
    let seasonId: number
    let waiverId: number

    beforeEach(async () => {
        const seeded = await seedBaselineSeason()
        seasonId = seeded.season.id
        waiverId = (await createWaiver()).id
        paymentsCreate.mockResolvedValue({
            payment: { id: "PAY-123", receiptUrl: "https://square.test/r/1" }
        })
    })

    it("requires a logged-in session", async () => {
        const result = await submitSeasonPayment(
            "src-token",
            formData,
            waiverId
        )
        expect(result.status).toBe(false)
        expect(result.message).toContain("logged in")
        expect(paymentsCreate).not.toHaveBeenCalled()
    })

    it("rejects stale waiver versions before charging", async () => {
        await createUserWithRoles([])
        const result = await submitSeasonPayment(
            "src-token",
            formData,
            waiverId + 999
        )
        expect(result.status).toBe(false)
        expect(result.message).toContain("waiver was updated")
        expect(paymentsCreate).not.toHaveBeenCalled()
    })

    it("charges the season amount and records signup + waiver acceptance", async () => {
        const player = await createUserWithRoles([])

        const result = await submitSeasonPayment(
            "src-token",
            formData,
            waiverId
        )

        expect(result.status).toBe(true)
        expect(result.paymentId).toBe("PAY-123")

        // $100.00 season fee → 10000 cents
        expect(paymentsCreate).toHaveBeenCalledTimes(1)
        expect(paymentsCreate.mock.calls[0][0].amountMoney).toEqual({
            currency: "USD",
            amount: BigInt(10000)
        })

        const [signup] = await db
            .select()
            .from(signups)
            .where(eq(signups.player, player.id))
        expect(signup.order_id).toBe("PAY-123")
        expect(signup.amount_paid).toBe("100.00")

        const acceptances = await db
            .select()
            .from(waiverAcceptances)
            .where(
                and(
                    eq(waiverAcceptances.user_id, player.id),
                    eq(waiverAcceptances.waiver_id, waiverId)
                )
            )
        expect(acceptances).toHaveLength(1)

        // The confirmation email is fired without await; poll the spy
        await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalled())
    })

    it("applies an active discount to the charged amount and consumes it", async () => {
        const player = await createUserWithRoles([])
        const discount = await createDiscount({
            user: player.id,
            percentage: "50"
        })

        const result = await submitSeasonPayment(
            "src-token",
            formData,
            waiverId,
            discount.id
        )

        expect(result.status).toBe(true)
        expect(paymentsCreate.mock.calls[0][0].amountMoney.amount).toBe(
            BigInt(5000)
        )

        const [signup] = await db
            .select()
            .from(signups)
            .where(eq(signups.player, player.id))
        expect(signup.amount_paid).toBe("50.00")

        const [used] = await db
            .select()
            .from(discounts)
            .where(eq(discounts.id, discount.id))
        expect(used.used).toBe(true)
    })

    it("rejects an already-registered player without charging", async () => {
        const player = await createUserWithRoles([])
        await createSignup({ season: seasonId, player: player.id })

        const result = await submitSeasonPayment(
            "src-token",
            formData,
            waiverId
        )

        expect(result.status).toBe(false)
        expect(result.message).toBe(
            "You are already registered for this season."
        )
        expect(result.shouldRefresh).toBe(true)
        expect(paymentsCreate).not.toHaveBeenCalled()
    })

    it("reports a failure when Square returns no payment", async () => {
        const player = await createUserWithRoles([])
        paymentsCreate.mockResolvedValue({})

        const result = await submitSeasonPayment(
            "src-token",
            formData,
            waiverId
        )

        expect(result.status).toBe(false)
        const rows = await db
            .select()
            .from(signups)
            .where(eq(signups.player, player.id))
        expect(rows).toHaveLength(0)
    })
})

describe("submitFreeSignup", () => {
    let waiverId: number

    beforeEach(async () => {
        await seedBaselineSeason()
        waiverId = (await createWaiver()).id
    })

    it("rejects discounts below 100%", async () => {
        const player = await createUserWithRoles([])
        const discount = await createDiscount({
            user: player.id,
            percentage: "75"
        })

        const result = await submitFreeSignup(formData, discount.id, waiverId)
        expect(result.status).toBe(false)
        expect(result.message).toBe("This discount requires payment.")
    })

    it("rejects a discount that belongs to someone else", async () => {
        const other = await createUser()
        const discount = await createDiscount({ user: other.id })
        await createUserWithRoles([])

        const result = await submitFreeSignup(formData, discount.id, waiverId)
        expect(result.status).toBe(false)
        expect(result.message).toBe("Invalid or expired discount.")
    })

    it("registers the player for free, consumes the discount, and clears the waitlist", async () => {
        const player = await createUserWithRoles([])
        const discount = await createDiscount({
            user: player.id,
            percentage: "100"
        })
        const [waitlistRow] = await db.select().from(waitlist)
        expect(waitlistRow).toBeUndefined()

        const result = await submitFreeSignup(formData, discount.id, waiverId)

        expect(result.status).toBe(true)

        const [signup] = await db
            .select()
            .from(signups)
            .where(eq(signups.player, player.id))
        expect(signup.amount_paid).toBe("0")
        expect(signup.order_id).toBe(`FREE-${discount.id}`)

        const [used] = await db
            .select()
            .from(discounts)
            .where(eq(discounts.id, discount.id))
        expect(used.used).toBe(true)
    })

    it("rejects an already-registered player", async () => {
        const player = await createUserWithRoles([])
        const discount = await createDiscount({ user: player.id })
        const first = await submitFreeSignup(formData, discount.id, waiverId)
        expect(first.status).toBe(true)

        const secondDiscount = await createDiscount({ user: player.id })
        const result = await submitFreeSignup(
            formData,
            secondDiscount.id,
            waiverId
        )

        expect(result.status).toBe(false)
        expect(result.message).toBe(
            "You are already registered for this season."
        )
        expect(result.shouldRefresh).toBe(true)
    })

    it("enforces the player cap unless the player is waitlist-approved", async () => {
        // A capped season created later becomes the current season
        const capped = await createSeason({ max_players: 1, year: 2027 })
        const occupant = await createUser()
        await createSignup({ season: capped.id, player: occupant.id })

        const player = await createUserWithRoles([])
        const discount = await createDiscount({ user: player.id })

        const blocked = await submitFreeSignup(formData, discount.id, waiverId)
        expect(blocked.status).toBe(false)
        expect(blocked.message).toContain("max number of players")

        // Approval on the waitlist lifts the cap for this player
        await addToWaitlist({
            season: capped.id,
            user: player.id,
            approved: true
        })
        const allowed = await submitFreeSignup(formData, discount.id, waiverId)
        expect(allowed.status).toBe(true)

        // The waitlist entry is cleaned up after successful signup
        const remaining = await db
            .select()
            .from(waitlist)
            .where(eq(waitlist.user, player.id))
        expect(remaining).toHaveLength(0)
    })
})
