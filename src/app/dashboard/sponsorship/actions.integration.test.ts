import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { auditLog, sponsors, sponsorships } from "@/database/schema"
import { withTransientRetry } from "@/lib/db-retry"
import { sentMessages } from "@/test/email"
import {
    createSeason,
    createSponsor,
    createSponsorship
} from "@/test/factories"
import { createUser, createUserWithRoles, loginAs } from "@/test/session"
import {
    createMySponsorLogoUpload,
    finalizeMySponsorLogoUpload,
    submitSponsorshipPayment,
    updateMySponsorDetails
} from "./actions"

const { paymentsCreate } = vi.hoisted(() => ({ paymentsCreate: vi.fn() }))
vi.mock("square", () => ({
    SquareClient: class {
        payments = { create: paymentsCreate }
    },
    SquareEnvironment: { Production: "production", Sandbox: "sandbox" }
}))

// Spy (not stub) so the persistence step can be made to fail after the
// card has been charged.
vi.mock("@/lib/db-retry", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/db-retry")>()
    return { ...actual, withTransientRetry: vi.fn(actual.withTransientRetry) }
})

async function seedPendingSponsorship() {
    const season = await createSeason()
    const contact = await createUser({
        first_name: "Pat",
        last_name: "Player",
        preferred_name: null
    })
    const sponsor = await createSponsor({
        name: "Bravo Bakery",
        contact_user: contact.id
    })
    const sponsorship = await createSponsorship({
        sponsor_id: sponsor.id,
        season: season.id,
        amount: "512.34"
    })
    return { season, contact, sponsor, sponsorship }
}

describe("submitSponsorshipPayment", () => {
    beforeEach(() => {
        paymentsCreate.mockReset()
        paymentsCreate.mockResolvedValue({
            payment: { id: "PAY-SP-1", receiptUrl: "https://square.test/r/sp1" }
        })
        vi.mocked(withTransientRetry).mockClear()
    })

    it("requires a logged-in session", async () => {
        const result = await submitSponsorshipPayment("tok")
        expect(result.status).toBe(false)
        expect(result.message).toContain("logged in")
        expect(paymentsCreate).not.toHaveBeenCalled()
    })

    it("fails when the user has no pending sponsorship", async () => {
        await createSeason()
        await createUserWithRoles([])
        const result = await submitSponsorshipPayment("tok")
        expect(result.status).toBe(false)
        expect(paymentsCreate).not.toHaveBeenCalled()
    })

    it("charges the stored amount, records the payment, and sends receipt + admin emails", async () => {
        const { contact, sponsorship } = await seedPendingSponsorship()
        const admin = await createUserWithRoles([{ role: "admin" }])
        loginAs(contact)

        const result = await submitSponsorshipPayment("tok")

        expect(result.status).toBe(true)
        expect(result.paymentId).toBe("PAY-SP-1")
        expect(result.receiptUrl).toBe("https://square.test/r/sp1")

        expect(paymentsCreate).toHaveBeenCalledTimes(1)
        const call = paymentsCreate.mock.calls[0][0]
        expect(call.amountMoney).toEqual({
            currency: "USD",
            amount: BigInt(51234)
        })
        expect(call.sourceId).toBe("tok")
        expect(call.buyerEmailAddress).toBe(contact.email)
        expect(call.note).toContain("Bravo Bakery")

        const [row] = await db
            .select()
            .from(sponsorships)
            .where(eq(sponsorships.id, sponsorship.id))
        expect(row.status).toBe("paid")
        expect(row.payment_method).toBe("square")
        expect(row.order_id).toBe("PAY-SP-1")
        expect(row.amount_paid).toBe("512.34")
        expect(row.receipt_url).toBe("https://square.test/r/sp1")

        const messages = sentMessages()
        const to = messages.map((m) => m.to).sort()
        expect(to).toEqual([admin.email, contact.email].sort())
        const receipt = messages.find((m) => m.to === contact.email)
        expect(receipt?.htmlBody).toContain("$512.34")
        expect(receipt?.htmlBody).toContain("https://square.test/r/sp1")

        const audits = await db.select().from(auditLog)
        expect(
            audits.some(
                (a) => a.entity_type === "sponsorships" && a.user === contact.id
            )
        ).toBe(true)
    })

    it("refuses to charge an already-paid sponsorship", async () => {
        const { contact, sponsorship } = await seedPendingSponsorship()
        await db
            .update(sponsorships)
            .set({ status: "paid", payment_method: "manual" })
            .where(eq(sponsorships.id, sponsorship.id))
        loginAs(contact)

        const result = await submitSponsorshipPayment("tok")
        expect(result.status).toBe(false)
        expect(result.message).toContain("already")
        expect(paymentsCreate).not.toHaveBeenCalled()
    })

    it("leaves the row pending when Square declines", async () => {
        const { contact, sponsorship } = await seedPendingSponsorship()
        loginAs(contact)
        paymentsCreate.mockRejectedValueOnce(new Error("CARD_DECLINED"))

        const result = await submitSponsorshipPayment("tok")
        expect(result.status).toBe(false)

        const [row] = await db
            .select()
            .from(sponsorships)
            .where(eq(sponsorships.id, sponsorship.id))
        expect(row.status).toBe("pending")
        expect(sentMessages()).toHaveLength(0)
    })

    it("tells the payer not to retry when the charge succeeded but recording failed", async () => {
        const { contact, sponsorship } = await seedPendingSponsorship()
        loginAs(contact)
        vi.mocked(withTransientRetry).mockRejectedValueOnce(
            new Error("connection lost")
        )

        const result = await submitSponsorshipPayment("tok")

        expect(result.status).toBe(false)
        expect(result.message).toContain("do NOT pay again")
        expect(result.paymentId).toBe("PAY-SP-1")
        expect(paymentsCreate).toHaveBeenCalledTimes(1)
        const [row] = await db
            .select()
            .from(sponsorships)
            .where(eq(sponsorships.id, sponsorship.id))
        expect(row.status).toBe("pending")
    })
})

describe("updateMySponsorDetails", () => {
    it("lets the contact update their business details", async () => {
        const { contact, sponsor } = await seedPendingSponsorship()
        loginAs(contact)

        const result = await updateMySponsorDetails({
            name: "Bravo Bakery & Cafe",
            website: "bravo.test",
            blurb: "Bread and coffee"
        })

        expect(result.status).toBe(true)
        const [row] = await db
            .select()
            .from(sponsors)
            .where(eq(sponsors.id, sponsor.id))
        expect(row.name).toBe("Bravo Bakery & Cafe")
        expect(row.website).toBe("https://bravo.test")
        expect(row.blurb).toBe("Bread and coffee")
    })

    it("rejects a user who is not the contact", async () => {
        const { sponsor } = await seedPendingSponsorship()
        await createUserWithRoles([])

        const result = await updateMySponsorDetails({
            name: "Hijacked",
            website: null,
            blurb: null
        })

        expect(result).toEqual({ status: false, message: "Unauthorized." })
        const [row] = await db
            .select()
            .from(sponsors)
            .where(eq(sponsors.id, sponsor.id))
        expect(row.name).toBe("Bravo Bakery")
    })

    it("rejects unauthenticated callers", async () => {
        expect(
            await updateMySponsorDetails({
                name: "X",
                website: null,
                blurb: null
            })
        ).toEqual({ status: false, message: "Unauthorized." })
    })
})

describe("sponsor logo upload by the contact", () => {
    it("issues and finalizes an upload for the contact's own sponsor", async () => {
        const { contact, sponsor } = await seedPendingSponsorship()
        loginAs(contact)

        const start = await createMySponsorLogoUpload("image/svg+xml", 2048)
        expect(start.status).toBe(true)
        if (!start.status) return
        expect(start.data.filename).toMatch(
            new RegExp(`^${sponsor.id}-\\d+\\.svg$`)
        )

        const done = await finalizeMySponsorLogoUpload(start.data.filename)
        expect(done.status).toBe(true)
        const [row] = await db
            .select()
            .from(sponsors)
            .where(eq(sponsors.id, sponsor.id))
        expect(row.logo_path).toBe(`/sponsorlogos/${start.data.filename}`)
    })

    it("rejects users who are not a sponsor contact", async () => {
        await seedPendingSponsorship()
        await createUserWithRoles([{ role: "captain" }])
        expect(await createMySponsorLogoUpload("image/png", 10)).toEqual({
            status: false,
            message: "Unauthorized."
        })
        expect(await finalizeMySponsorLogoUpload("1-1.png")).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })
})
