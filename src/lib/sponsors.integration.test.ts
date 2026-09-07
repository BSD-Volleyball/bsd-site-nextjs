import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { sponsorships } from "@/database/schema"
import {
    createSeason,
    createSponsor,
    createSponsorship
} from "@/test/factories"
import { sentMessages } from "@/test/email"
import { createUser, createUserWithRoles } from "@/test/session"
import {
    getPublicSponsors,
    getSponsorshipForUser,
    markSponsorshipPaid,
    notifyAdminsSponsorshipPaid
} from "./sponsors"

describe("getPublicSponsors", () => {
    it("lists only paid sponsorships for the season, richest first then by name", async () => {
        const season = await createSeason()
        const otherSeason = await createSeason()
        const contact = await createUser()

        const bravo = await createSponsor({
            name: "Bravo Bakery",
            contact_user: contact.id,
            website: "https://bravo.test",
            blurb: "Fresh bread",
            logo_path: "/sponsorlogos/1-1.png"
        })
        const alpha = await createSponsor({
            name: "Alpha Autos",
            contact_user: contact.id
        })
        const zulu = await createSponsor({
            name: "Zulu Zip",
            contact_user: contact.id
        })
        const unpaid = await createSponsor({
            name: "Unpaid Co",
            contact_user: contact.id
        })
        const elsewhere = await createSponsor({
            name: "Other Season Inc",
            contact_user: contact.id
        })

        await createSponsorship({
            sponsor_id: bravo.id,
            season: season.id,
            amount: "500.00",
            status: "paid"
        })
        await createSponsorship({
            sponsor_id: alpha.id,
            season: season.id,
            amount: "1000.00",
            status: "paid"
        })
        await createSponsorship({
            sponsor_id: zulu.id,
            season: season.id,
            amount: "500.00",
            status: "paid"
        })
        await createSponsorship({
            sponsor_id: unpaid.id,
            season: season.id,
            amount: "9000.00",
            status: "pending"
        })
        await createSponsorship({
            sponsor_id: elsewhere.id,
            season: otherSeason.id,
            amount: "9000.00",
            status: "paid"
        })

        const result = await getPublicSponsors(season.id)

        expect(result.map((s) => s.name)).toEqual([
            "Alpha Autos",
            "Bravo Bakery",
            "Zulu Zip"
        ])
        const bravoRow = result[1]
        expect(bravoRow.website).toBe("https://bravo.test")
        expect(bravoRow.blurb).toBe("Fresh bread")
        expect(bravoRow.logoUrl).toMatch(/\/sponsorlogos\/1-1\.png$/)
        expect(result[0].logoUrl).toBeNull()
    })
})

describe("getSponsorshipForUser", () => {
    it("returns null when the user is not a sponsor contact this season", async () => {
        const season = await createSeason()
        const user = await createUser()
        expect(await getSponsorshipForUser(user.id, season.id)).toBeNull()
    })

    it("returns the contact's sponsorship for the requested season only", async () => {
        const oldSeason = await createSeason()
        const season = await createSeason()
        const contact = await createUser()
        const sponsor = await createSponsor({
            name: "Bravo Bakery",
            contact_user: contact.id
        })
        await createSponsorship({
            sponsor_id: sponsor.id,
            season: oldSeason.id,
            amount: "100.00",
            status: "paid"
        })
        const current = await createSponsorship({
            sponsor_id: sponsor.id,
            season: season.id,
            amount: "750.00"
        })

        const result = await getSponsorshipForUser(contact.id, season.id)

        expect(result).toMatchObject({
            sponsorshipId: current.id,
            sponsorId: sponsor.id,
            seasonId: season.id,
            name: "Bravo Bakery",
            amount: "750.00",
            status: "pending",
            paymentMethod: null,
            receiptUrl: null
        })
    })
})

describe("markSponsorshipPaid", () => {
    it("records the payment once and ignores a second attempt", async () => {
        const season = await createSeason()
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        const sponsorship = await createSponsorship({
            sponsor_id: sponsor.id,
            season: season.id,
            amount: "500.00"
        })

        const first = await markSponsorshipPaid(db, {
            sponsorshipId: sponsorship.id,
            method: "square",
            orderId: "PAY-1",
            amountPaid: "500.00",
            receiptUrl: "https://square.test/r/1"
        })
        expect(first).toBe(true)

        const second = await markSponsorshipPaid(db, {
            sponsorshipId: sponsorship.id,
            method: "manual",
            amountPaid: "1.00",
            note: "should not apply"
        })
        expect(second).toBe(false)

        const [row] = await db
            .select()
            .from(sponsorships)
            .where(eq(sponsorships.id, sponsorship.id))
        expect(row.status).toBe("paid")
        expect(row.payment_method).toBe("square")
        expect(row.order_id).toBe("PAY-1")
        expect(row.amount_paid).toBe("500.00")
        expect(row.receipt_url).toBe("https://square.test/r/1")
        expect(row.paid_at).not.toBeNull()
        expect(row.paid_note).toBeNull()
    })

    it("stores who marked a manual payment and the note", async () => {
        const season = await createSeason()
        const contact = await createUser()
        const admin = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        const sponsorship = await createSponsorship({
            sponsor_id: sponsor.id,
            season: season.id
        })

        await markSponsorshipPaid(db, {
            sponsorshipId: sponsorship.id,
            method: "manual",
            amountPaid: "500.00",
            note: "check #1042",
            markedPaidBy: admin.id
        })

        const [row] = await db
            .select()
            .from(sponsorships)
            .where(eq(sponsorships.id, sponsorship.id))
        expect(row.payment_method).toBe("manual")
        expect(row.paid_note).toBe("check #1042")
        expect(row.marked_paid_by).toBe(admin.id)
        expect(row.order_id).toBeNull()
    })
})

describe("notifyAdminsSponsorshipPaid", () => {
    it("emails every admin except the acting one", async () => {
        const actor = await createUserWithRoles([{ role: "admin" }])
        const otherAdmin = await createUserWithRoles([{ role: "admin" }], {
            first_name: "Casey"
        })
        await createUserWithRoles([{ role: "captain" }])

        await notifyAdminsSponsorshipPaid({
            sponsorName: "Bravo Bakery",
            contactName: "Pat Player",
            amount: "500.00",
            method: "manual",
            note: "check #1042",
            actorUserId: actor.id
        })

        const messages = sentMessages()
        expect(messages.map((m) => m.to)).toEqual([otherAdmin.email])
        expect(messages[0].subject).toContain("Bravo Bakery")
        expect(messages[0].htmlBody).toContain("Casey")
        expect(messages[0].htmlBody).toContain("$500.00")
        expect(messages[0].htmlBody).toContain("check #1042")
    })

    it("sends nothing when there is no one else to tell", async () => {
        const actor = await createUserWithRoles([{ role: "admin" }])
        await notifyAdminsSponsorshipPaid({
            sponsorName: "Bravo Bakery",
            contactName: "Pat Player",
            amount: "500.00",
            method: "square",
            actorUserId: actor.id
        })
        expect(sentMessages()).toHaveLength(0)
    })
})
