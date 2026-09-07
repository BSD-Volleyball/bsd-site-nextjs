import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { auditLog, sponsors, sponsorships } from "@/database/schema"
import { deleteR2Object } from "@/lib/r2"
import { sentMessages } from "@/test/email"
import {
    createSeason,
    createSponsor,
    createSponsorship
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import {
    createSponsorLogoUpload,
    createSponsorship as createSponsorshipAction,
    deleteSponsorship,
    finalizeSponsorLogoUpload,
    getSponsorships,
    markSponsorshipPaidManually,
    updateSponsor,
    updateSponsorshipAmount
} from "./actions"

const UNAUTHORIZED = { status: false, message: "Unauthorized." }

describe("createSponsorship", () => {
    let seasonId: number

    beforeEach(async () => {
        seasonId = (await createSeason()).id
    })

    it("rejects unauthenticated callers", async () => {
        const contact = await createUser()
        const result = await createSponsorshipAction({
            newSponsor: { name: "Bravo Bakery", website: null, blurb: null },
            contactUserId: contact.id,
            amount: "500"
        })
        expect(result).toEqual(UNAUTHORIZED)
        expect(await db.select().from(sponsors)).toHaveLength(0)
    })

    it("rejects authenticated non-admins", async () => {
        const contact = await createUser()
        await createUserWithRoles([{ role: "captain" }])
        const result = await createSponsorshipAction({
            newSponsor: { name: "Bravo Bakery", website: null, blurb: null },
            contactUserId: contact.id,
            amount: "500"
        })
        expect(result).toEqual(UNAUTHORIZED)
    })

    it("creates the sponsor and sponsorship, emails the contact, and audits", async () => {
        const contact = await createUser({
            first_name: "Pat",
            last_name: "Player",
            preferred_name: null
        })
        const admin = await createUserWithRoles([{ role: "admin" }])

        const result = await createSponsorshipAction({
            newSponsor: {
                name: "  Bravo Bakery ",
                website: "bravo.test",
                blurb: "Fresh bread"
            },
            contactUserId: contact.id,
            amount: "500"
        })

        expect(result.status).toBe(true)
        if (!result.status) return

        const [sponsor] = await db.select().from(sponsors)
        expect(sponsor.name).toBe("Bravo Bakery")
        expect(sponsor.website).toBe("https://bravo.test")
        expect(sponsor.contact_user).toBe(contact.id)

        const [row] = await db
            .select()
            .from(sponsorships)
            .where(eq(sponsorships.id, result.data.sponsorshipId))
        expect(row.sponsor_id).toBe(sponsor.id)
        expect(row.season).toBe(seasonId)
        expect(row.amount).toBe("500.00")
        expect(row.status).toBe("pending")
        expect(row.created_by).toBe(admin.id)

        const messages = sentMessages()
        expect(messages.map((m) => m.to)).toEqual([contact.email])
        expect(messages[0].subject).toContain("sponsorship")
        expect(messages[0].htmlBody).toContain("$500.00")
        expect(messages[0].htmlBody).toContain("/dashboard/sponsorship")

        const audits = await db.select().from(auditLog)
        expect(audits.some((a) => a.entity_type === "sponsorships")).toBe(true)
        expect(revalidatePath).toHaveBeenCalledWith(
            "/dashboard/manage-sponsors"
        )
        expect(revalidatePath).toHaveBeenCalledWith("/sponsors")
    })

    it("renews an existing sponsor without duplicating the business", async () => {
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        await createUserWithRoles([{ role: "admin" }])

        const result = await createSponsorshipAction({
            sponsorId: sponsor.id,
            amount: "750.50"
        })

        expect(result.status).toBe(true)
        expect(await db.select().from(sponsors)).toHaveLength(1)
        const [row] = await db.select().from(sponsorships)
        expect(row.sponsor_id).toBe(sponsor.id)
        expect(row.amount).toBe("750.50")
        expect(sentMessages().map((m) => m.to)).toEqual([contact.email])
    })

    it("refuses a second sponsorship for the same sponsor and season", async () => {
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        await createSponsorship({ sponsor_id: sponsor.id, season: seasonId })
        await createUserWithRoles([{ role: "admin" }])

        const result = await createSponsorshipAction({
            sponsorId: sponsor.id,
            amount: "100"
        })

        expect(result.status).toBe(false)
        expect(result.message).toContain("already has a sponsorship")
        expect(sentMessages()).toHaveLength(0)
    })

    it.each([
        "0",
        "-5",
        "abc",
        "1e9",
        ""
    ])("rejects invalid amount %j", async (amount) => {
        const contact = await createUser()
        await createUserWithRoles([{ role: "admin" }])
        const result = await createSponsorshipAction({
            newSponsor: { name: "Bravo", website: null, blurb: null },
            contactUserId: contact.id,
            amount
        })
        expect(result.status).toBe(false)
        expect(result.message).toBe("Amount must be a positive dollar amount.")
    })

    it("rejects an unknown contact user", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await createSponsorshipAction({
            newSponsor: { name: "Bravo", website: null, blurb: null },
            contactUserId: "nobody",
            amount: "100"
        })
        expect(result.status).toBe(false)
        expect(result.message).toBe("Contact user not found.")
    })
})

describe("getSponsorships", () => {
    it("lists the season's sponsorships with contact names for admins", async () => {
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
        await createSponsorship({ sponsor_id: sponsor.id, season: season.id })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getSponsorships()
        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.sponsorships).toHaveLength(1)
        expect(result.data.sponsorships[0]).toMatchObject({
            sponsorName: "Bravo Bakery",
            contactName: "Pat Player",
            contactUserId: contact.id,
            amount: "500.00",
            status: "pending"
        })
        expect(result.data.sponsors.map((s) => s.name)).toEqual([
            "Bravo Bakery"
        ])
    })

    it("rejects non-admins", async () => {
        await createUserWithRoles([{ role: "commissioner" }])
        expect(await getSponsorships()).toEqual(UNAUTHORIZED)
    })
})

describe("updateSponsor", () => {
    it("updates business details and the contact", async () => {
        const contact = await createUser()
        const newContact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        await createUserWithRoles([{ role: "admin" }])

        const result = await updateSponsor(sponsor.id, {
            name: "Bravo Bakery & Co",
            website: "https://bravo.test",
            blurb: "Now with cake",
            contactUserId: newContact.id
        })

        expect(result.status).toBe(true)
        const [row] = await db
            .select()
            .from(sponsors)
            .where(eq(sponsors.id, sponsor.id))
        expect(row.name).toBe("Bravo Bakery & Co")
        expect(row.website).toBe("https://bravo.test")
        expect(row.blurb).toBe("Now with cake")
        expect(row.contact_user).toBe(newContact.id)
        expect(revalidatePath).toHaveBeenCalledWith("/sponsors")
    })

    it("requires a name", async () => {
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        await createUserWithRoles([{ role: "admin" }])
        const result = await updateSponsor(sponsor.id, {
            name: "   ",
            website: null,
            blurb: null,
            contactUserId: contact.id
        })
        expect(result.status).toBe(false)
    })

    it("rejects non-admins", async () => {
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        await createUserWithRoles([])
        const result = await updateSponsor(sponsor.id, {
            name: "X",
            website: null,
            blurb: null,
            contactUserId: contact.id
        })
        expect(result).toEqual(UNAUTHORIZED)
    })
})

describe("updateSponsorshipAmount", () => {
    it("changes the amount while pending", async () => {
        const season = await createSeason()
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        const sponsorship = await createSponsorship({
            sponsor_id: sponsor.id,
            season: season.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await updateSponsorshipAmount(sponsorship.id, "1250")
        expect(result.status).toBe(true)
        const [row] = await db
            .select()
            .from(sponsorships)
            .where(eq(sponsorships.id, sponsorship.id))
        expect(row.amount).toBe("1250.00")
    })

    it("refuses once paid", async () => {
        const season = await createSeason()
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        const sponsorship = await createSponsorship({
            sponsor_id: sponsor.id,
            season: season.id,
            status: "paid"
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await updateSponsorshipAmount(sponsorship.id, "1")
        expect(result.status).toBe(false)
        expect(result.message).toContain("already paid")
    })
})

describe("markSponsorshipPaidManually", () => {
    it("marks it paid, records the note, and emails the other admins", async () => {
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
            amount: "500.00"
        })
        const otherAdmin = await createUserWithRoles([{ role: "admin" }])
        const actor = await createUserWithRoles([{ role: "admin" }])

        const result = await markSponsorshipPaidManually(sponsorship.id, {
            note: "check #1042"
        })

        expect(result.status).toBe(true)
        const [row] = await db
            .select()
            .from(sponsorships)
            .where(eq(sponsorships.id, sponsorship.id))
        expect(row.status).toBe("paid")
        expect(row.payment_method).toBe("manual")
        expect(row.amount_paid).toBe("500.00")
        expect(row.paid_note).toBe("check #1042")
        expect(row.marked_paid_by).toBe(actor.id)

        const messages = sentMessages()
        expect(messages.map((m) => m.to)).toEqual([otherAdmin.email])
        expect(messages[0].htmlBody).toContain("Pat Player")
        expect(revalidatePath).toHaveBeenCalledWith("/sponsors")
        expect(revalidatePath).toHaveBeenCalledWith("/")
    })

    it("accepts an override for the amount actually received", async () => {
        const season = await createSeason()
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        const sponsorship = await createSponsorship({
            sponsor_id: sponsor.id,
            season: season.id,
            amount: "500.00"
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await markSponsorshipPaidManually(sponsorship.id, {
            note: null,
            amountPaid: "450"
        })
        expect(result.status).toBe(true)
        const [row] = await db
            .select()
            .from(sponsorships)
            .where(eq(sponsorships.id, sponsorship.id))
        expect(row.amount_paid).toBe("450.00")
        expect(row.amount).toBe("500.00")
    })

    it("refuses when already paid", async () => {
        const season = await createSeason()
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        const sponsorship = await createSponsorship({
            sponsor_id: sponsor.id,
            season: season.id,
            status: "paid",
            payment_method: "square"
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await markSponsorshipPaidManually(sponsorship.id, {
            note: null
        })
        expect(result.status).toBe(false)
        expect(result.message).toContain("already paid")
        expect(sentMessages()).toHaveLength(0)
    })

    it("rejects non-admins", async () => {
        const season = await createSeason()
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        const sponsorship = await createSponsorship({
            sponsor_id: sponsor.id,
            season: season.id
        })
        await createUserWithRoles([{ role: "referee" }])
        expect(
            await markSponsorshipPaidManually(sponsorship.id, { note: null })
        ).toEqual(UNAUTHORIZED)
    })
})

describe("deleteSponsorship", () => {
    it("removes a pending sponsorship", async () => {
        const season = await createSeason()
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        const sponsorship = await createSponsorship({
            sponsor_id: sponsor.id,
            season: season.id
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await deleteSponsorship(sponsorship.id)
        expect(result.status).toBe(true)
        expect(await db.select().from(sponsorships)).toHaveLength(0)
        // The business record survives for future seasons.
        expect(await db.select().from(sponsors)).toHaveLength(1)
    })

    it("refuses to delete a paid sponsorship", async () => {
        const season = await createSeason()
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        const sponsorship = await createSponsorship({
            sponsor_id: sponsor.id,
            season: season.id,
            status: "paid"
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await deleteSponsorship(sponsorship.id)
        expect(result.status).toBe(false)
        expect(await db.select().from(sponsorships)).toHaveLength(1)
    })

    it("rejects unauthenticated callers", async () => {
        expect(await deleteSponsorship(1)).toEqual(UNAUTHORIZED)
    })
})

describe("sponsor logo upload", () => {
    it("issues a presigned upload for an allowed image type", async () => {
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        await createUserWithRoles([{ role: "admin" }])

        const result = await createSponsorLogoUpload(
            sponsor.id,
            "image/png",
            1024
        )
        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.uploadUrl).toBe("https://r2.test/presigned-upload")
        expect(result.data.filename).toMatch(
            new RegExp(`^${sponsor.id}-\\d+\\.png$`)
        )
    })

    it("rejects disallowed content types and oversized files", async () => {
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        await createUserWithRoles([{ role: "admin" }])

        const gif = await createSponsorLogoUpload(sponsor.id, "image/gif", 10)
        expect(gif.status).toBe(false)
        const huge = await createSponsorLogoUpload(
            sponsor.id,
            "image/png",
            3 * 1024 * 1024
        )
        expect(huge.status).toBe(false)
    })

    it("finalize stores the path and deletes the previous logo object", async () => {
        const contact = await createUser()
        const sponsor = await createSponsor({
            contact_user: contact.id,
            logo_path: "/sponsorlogos/old.png"
        })
        await createUserWithRoles([{ role: "admin" }])

        const filename = `${sponsor.id}-1700000000000.png`
        const result = await finalizeSponsorLogoUpload(sponsor.id, filename)
        expect(result.status).toBe(true)

        const [row] = await db
            .select()
            .from(sponsors)
            .where(eq(sponsors.id, sponsor.id))
        expect(row.logo_path).toBe(`/sponsorlogos/${filename}`)
        expect(vi.mocked(deleteR2Object)).toHaveBeenCalledWith(
            "sponsorlogos/old.png"
        )
    })

    it("finalize rejects a filename that belongs to another sponsor", async () => {
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        await createUserWithRoles([{ role: "admin" }])

        const result = await finalizeSponsorLogoUpload(
            sponsor.id,
            `${sponsor.id + 1}-1700000000000.png`
        )
        expect(result.status).toBe(false)
    })

    it("rejects non-admins", async () => {
        const contact = await createUser()
        const sponsor = await createSponsor({ contact_user: contact.id })
        await createUserWithRoles([{ role: "captain" }])
        expect(
            await createSponsorLogoUpload(sponsor.id, "image/png", 10)
        ).toEqual(UNAUTHORIZED)
        expect(await finalizeSponsorLogoUpload(sponsor.id, "x.png")).toEqual(
            UNAUTHORIZED
        )
    })
})
