"use server"

import { aliasedTable, and, asc, desc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { sponsors, sponsorships, users } from "@/database/schema"
import {
    type ActionResult,
    ActionError,
    fail,
    ok,
    requirePermission,
    requirePositiveInt,
    requireSeasonConfig,
    requireSession,
    withAction
} from "@/lib/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import { buildSponsorshipPaymentDueHtml } from "@/lib/email-html"
import { dispatchNotification } from "@/lib/notifications/dispatch"
import { formatSeasonLabel } from "@/lib/site-config"
import { site } from "@/config/site"
import {
    type SponsorshipPaymentMethod,
    type SponsorshipStatus,
    finalizeSponsorLogo,
    getContactDisplay,
    issueSponsorLogoUpload,
    markSponsorshipPaid,
    normalizeSponsorDetails,
    notifyAdminsSponsorshipPaid,
    parseSponsorshipAmount,
    sponsorLogoUrl
} from "@/lib/sponsors"
import { formatPlayerName } from "@/lib/utils"

export interface SponsorshipRow {
    sponsorshipId: number
    sponsorId: number
    sponsorName: string
    website: string | null
    blurb: string | null
    logoUrl: string | null
    contactUserId: string
    contactName: string
    contactEmail: string
    amount: string
    status: SponsorshipStatus
    paymentMethod: SponsorshipPaymentMethod | null
    amountPaid: string | null
    receiptUrl: string | null
    paidAt: Date | null
    paidNote: string | null
    markedPaidByName: string | null
    createdAt: Date
}

export interface SponsorOption {
    id: number
    name: string
    contactUserId: string
    contactName: string
}

export interface ManageSponsorsData {
    seasonId: number
    seasonLabel: string
    sponsorships: SponsorshipRow[]
    /** Every sponsor ever, for renewing a returning business. */
    sponsors: SponsorOption[]
}

// The sponsor contact, joined through sponsors.contact_user.
const contact = aliasedTable(users, "sp_contact")

// Every public surface that renders sponsors, plus the contact's dashboard.
function revalidateSponsorPages() {
    revalidatePath("/dashboard/manage-sponsors")
    revalidatePath("/dashboard/sponsorship")
    revalidatePath("/dashboard")
    revalidatePath("/sponsors")
    revalidatePath("/")
}

export const getSponsorships = withAction(
    async (): Promise<ActionResult<ManageSponsorsData>> => {
        await requirePermission("sponsors:manage")
        const config = await requireSeasonConfig()

        const rows = await db
            .select({
                sponsorshipId: sponsorships.id,
                sponsorId: sponsors.id,
                sponsorName: sponsors.name,
                website: sponsors.website,
                blurb: sponsors.blurb,
                logoPath: sponsors.logo_path,
                contactUserId: contact.id,
                contactFirst: contact.first_name,
                contactLast: contact.last_name,
                contactPreferred: contact.preferred_name,
                contactEmail: contact.email,
                amount: sponsorships.amount,
                status: sponsorships.status,
                paymentMethod: sponsorships.payment_method,
                amountPaid: sponsorships.amount_paid,
                receiptUrl: sponsorships.receipt_url,
                paidAt: sponsorships.paid_at,
                paidNote: sponsorships.paid_note,
                markedPaidBy: sponsorships.marked_paid_by,
                createdAt: sponsorships.created_at
            })
            .from(sponsorships)
            .innerJoin(sponsors, eq(sponsorships.sponsor_id, sponsors.id))
            .innerJoin(contact, eq(sponsors.contact_user, contact.id))
            .where(eq(sponsorships.season, config.seasonId))
            .orderBy(desc(sponsorships.amount), asc(sponsors.name))

        // Who marked manual payments — a second users lookup rather than a
        // second aliased join, which Drizzle's types collapse to never.
        const markerIds = [
            ...new Set(
                rows
                    .map((r) => r.markedPaidBy)
                    .filter((id): id is string => id !== null)
            )
        ]
        const markerNames = new Map<string, string>()
        if (markerIds.length > 0) {
            const markers = await db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name
                })
                .from(users)
                .where(inArray(users.id, markerIds))
            for (const m of markers) {
                markerNames.set(
                    m.id,
                    formatPlayerName(m.firstName, m.lastName, m.preferredName)
                )
            }
        }
        const allSponsors = await db
            .select({
                id: sponsors.id,
                name: sponsors.name,
                contactUserId: contact.id,
                contactFirst: contact.first_name,
                contactLast: contact.last_name,
                contactPreferred: contact.preferred_name
            })
            .from(sponsors)
            .innerJoin(contact, eq(sponsors.contact_user, contact.id))
            .orderBy(asc(sponsors.name))

        return ok({
            seasonId: config.seasonId,
            seasonLabel: formatSeasonLabel(config),
            sponsorships: rows.map((row) => ({
                sponsorshipId: row.sponsorshipId,
                sponsorId: row.sponsorId,
                sponsorName: row.sponsorName,
                website: row.website,
                blurb: row.blurb,
                logoUrl: sponsorLogoUrl(row.logoPath),
                contactUserId: row.contactUserId,
                contactName: formatPlayerName(
                    row.contactFirst,
                    row.contactLast,
                    row.contactPreferred
                ),
                contactEmail: row.contactEmail,
                amount: row.amount,
                status: row.status === "paid" ? "paid" : "pending",
                paymentMethod:
                    row.paymentMethod === "square" ||
                    row.paymentMethod === "manual"
                        ? row.paymentMethod
                        : null,
                amountPaid: row.amountPaid,
                receiptUrl: row.receiptUrl,
                paidAt: row.paidAt,
                paidNote: row.paidNote,
                markedPaidByName: row.markedPaidBy
                    ? (markerNames.get(row.markedPaidBy) ?? null)
                    : null,
                createdAt: row.createdAt
            })),
            sponsors: allSponsors.map((s) => ({
                id: s.id,
                name: s.name,
                contactUserId: s.contactUserId,
                contactName: formatPlayerName(
                    s.contactFirst,
                    s.contactLast,
                    s.contactPreferred
                )
            }))
        })
    }
)

export interface CreateSponsorshipInput {
    /** Renew an existing sponsor… */
    sponsorId?: number
    /** …or create a new one. Exactly one of the two must be supplied. */
    newSponsor?: { name: string; website: string | null; blurb: string | null }
    /** Required with newSponsor; ignored for an existing sponsor. */
    contactUserId?: string
    amount: string
}

export const createSponsorship = withAction(
    async (
        input: CreateSponsorshipInput
    ): Promise<ActionResult<{ sponsorshipId: number }>> => {
        await requirePermission("sponsors:manage")
        const session = await requireSession()
        const config = await requireSeasonConfig()
        const amount = parseSponsorshipAmount(input.amount)

        let sponsorId: number
        let sponsorName: string
        let contactUserId: string

        if (input.sponsorId != null) {
            sponsorId = requirePositiveInt(input.sponsorId, "sponsor")
            const [existing] = await db
                .select({ name: sponsors.name, contact: sponsors.contact_user })
                .from(sponsors)
                .where(eq(sponsors.id, sponsorId))
                .limit(1)
            if (!existing) return fail("Sponsor not found.")
            sponsorName = existing.name
            contactUserId = existing.contact
        } else if (input.newSponsor) {
            const details = normalizeSponsorDetails(input.newSponsor)
            if (
                typeof input.contactUserId !== "string" ||
                !input.contactUserId
            ) {
                return fail("Contact user is required.")
            }
            const [contactRow] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.id, input.contactUserId))
                .limit(1)
            if (!contactRow) return fail("Contact user not found.")

            const [created] = await db
                .insert(sponsors)
                .values({ ...details, contact_user: contactRow.id })
                .returning({ id: sponsors.id })
            sponsorId = created.id
            sponsorName = details.name
            contactUserId = contactRow.id

            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "sponsors",
                entityId: sponsorId,
                summary: `Created sponsor ${sponsorName} (contact ${contactUserId})`
            })
        } else {
            return fail("Choose an existing sponsor or enter a new one.")
        }

        const [duplicate] = await db
            .select({ id: sponsorships.id })
            .from(sponsorships)
            .where(
                and(
                    eq(sponsorships.sponsor_id, sponsorId),
                    eq(sponsorships.season, config.seasonId)
                )
            )
            .limit(1)
        if (duplicate) {
            return fail(
                `${sponsorName} already has a sponsorship for ${formatSeasonLabel(config)}.`
            )
        }

        const [row] = await db
            .insert(sponsorships)
            .values({
                sponsor_id: sponsorId,
                season: config.seasonId,
                amount,
                created_by: session.user.id
            })
            .returning({ id: sponsorships.id })

        await logAuditEntry({
            userId: session.user.id,
            action: "create",
            entityType: "sponsorships",
            entityId: row.id,
            summary: `Created $${amount} sponsorship for ${sponsorName} (${formatSeasonLabel(config)})`
        })

        const seasonLabel = formatSeasonLabel(config)
        const contactDisplay = await getContactDisplay(contactUserId)
        if (contactDisplay) {
            await dispatchNotification({
                type: "sponsorship_payment_due",
                recipients: [
                    {
                        userId: contactUserId,
                        email: contactDisplay.email,
                        firstName: contactDisplay.firstName
                    }
                ],
                subject: `Your ${sponsorName} sponsorship for ${seasonLabel} is ready to pay`,
                htmlBody: buildSponsorshipPaymentDueHtml({
                    firstName: contactDisplay.firstName,
                    sponsorName,
                    amount,
                    seasonLabel,
                    payUrl: `${site.url}/dashboard/sponsorship`
                })
            })
        }

        revalidateSponsorPages()
        return ok(
            { sponsorshipId: row.id },
            `Sponsorship created. ${sponsorName}'s contact has been emailed.`
        )
    }
)

export const updateSponsor = withAction(
    async (
        sponsorIdInput: number,
        input: {
            name: string
            website: string | null
            blurb: string | null
            contactUserId: string
        }
    ): Promise<ActionResult<void>> => {
        await requirePermission("sponsors:manage")
        const session = await requireSession()
        const sponsorId = requirePositiveInt(sponsorIdInput, "sponsor")
        const details = normalizeSponsorDetails(input)

        if (typeof input.contactUserId !== "string" || !input.contactUserId) {
            return fail("Contact user is required.")
        }
        const [contactRow] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, input.contactUserId))
            .limit(1)
        if (!contactRow) return fail("Contact user not found.")

        const updated = await db
            .update(sponsors)
            .set({
                ...details,
                contact_user: contactRow.id,
                updated_at: new Date()
            })
            .where(eq(sponsors.id, sponsorId))
            .returning({ id: sponsors.id })
        if (updated.length === 0) return fail("Sponsor not found.")

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "sponsors",
            entityId: sponsorId,
            summary: `Updated sponsor ${details.name} (contact ${contactRow.id})`
        })

        revalidateSponsorPages()
        return ok(undefined, "Sponsor updated.")
    }
)

async function loadSponsorshipForAdmin(sponsorshipId: number) {
    const [row] = await db
        .select({
            id: sponsorships.id,
            status: sponsorships.status,
            amount: sponsorships.amount,
            sponsorName: sponsors.name,
            contactUserId: sponsors.contact_user
        })
        .from(sponsorships)
        .innerJoin(sponsors, eq(sponsorships.sponsor_id, sponsors.id))
        .where(eq(sponsorships.id, sponsorshipId))
        .limit(1)
    if (!row) throw new ActionError("Sponsorship not found.")
    return row
}

export const updateSponsorshipAmount = withAction(
    async (
        sponsorshipIdInput: number,
        amountInput: string
    ): Promise<ActionResult<void>> => {
        await requirePermission("sponsors:manage")
        const session = await requireSession()
        const sponsorshipId = requirePositiveInt(
            sponsorshipIdInput,
            "sponsorship"
        )
        const amount = parseSponsorshipAmount(amountInput)

        const row = await loadSponsorshipForAdmin(sponsorshipId)
        if (row.status === "paid") {
            return fail(
                "This sponsorship is already paid; the amount is locked."
            )
        }

        await db
            .update(sponsorships)
            .set({ amount })
            .where(eq(sponsorships.id, sponsorshipId))

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "sponsorships",
            entityId: sponsorshipId,
            summary: `Changed ${row.sponsorName} sponsorship amount $${row.amount} → $${amount}`
        })

        revalidateSponsorPages()
        return ok(undefined, "Amount updated.")
    }
)

export const markSponsorshipPaidManually = withAction(
    async (
        sponsorshipIdInput: number,
        input: { note: string | null; amountPaid?: string }
    ): Promise<ActionResult<void>> => {
        await requirePermission("sponsors:manage")
        const session = await requireSession()
        const sponsorshipId = requirePositiveInt(
            sponsorshipIdInput,
            "sponsorship"
        )

        const row = await loadSponsorshipForAdmin(sponsorshipId)
        if (row.status === "paid") {
            return fail("This sponsorship is already paid.")
        }

        const amountPaid =
            input.amountPaid != null && input.amountPaid !== ""
                ? parseSponsorshipAmount(input.amountPaid)
                : row.amount
        const note =
            typeof input.note === "string" && input.note.trim()
                ? input.note.trim().slice(0, 500)
                : undefined

        const flipped = await markSponsorshipPaid(db, {
            sponsorshipId,
            method: "manual",
            amountPaid,
            note,
            markedPaidBy: session.user.id
        })
        if (!flipped) return fail("This sponsorship is already paid.")

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "sponsorships",
            entityId: sponsorshipId,
            summary: `Marked ${row.sponsorName} sponsorship paid manually ($${amountPaid})${note ? ` — ${note}` : ""}`
        })

        const contact = await getContactDisplay(row.contactUserId)
        await notifyAdminsSponsorshipPaid({
            sponsorName: row.sponsorName,
            contactName: contact?.fullName ?? "Unknown contact",
            amount: amountPaid,
            method: "manual",
            note,
            actorUserId: session.user.id
        })

        revalidateSponsorPages()
        return ok(undefined, `${row.sponsorName} marked as paid.`)
    }
)

export const deleteSponsorship = withAction(
    async (sponsorshipIdInput: number): Promise<ActionResult<void>> => {
        await requirePermission("sponsors:manage")
        const session = await requireSession()
        const sponsorshipId = requirePositiveInt(
            sponsorshipIdInput,
            "sponsorship"
        )

        const row = await loadSponsorshipForAdmin(sponsorshipId)
        if (row.status === "paid") {
            return fail(
                "A paid sponsorship carries a payment record and cannot be deleted."
            )
        }

        await db.delete(sponsorships).where(eq(sponsorships.id, sponsorshipId))

        await logAuditEntry({
            userId: session.user.id,
            action: "delete",
            entityType: "sponsorships",
            entityId: sponsorshipId,
            summary: `Deleted pending $${row.amount} sponsorship for ${row.sponsorName}`
        })

        revalidateSponsorPages()
        return ok(undefined, "Sponsorship removed.")
    }
)

export const createSponsorLogoUpload = withAction(
    async (
        sponsorIdInput: number,
        contentType: string,
        contentLength: number
    ): Promise<ActionResult<{ uploadUrl: string; filename: string }>> => {
        await requirePermission("sponsors:manage")
        const sponsorId = requirePositiveInt(sponsorIdInput, "sponsor")
        const [existing] = await db
            .select({ id: sponsors.id })
            .from(sponsors)
            .where(eq(sponsors.id, sponsorId))
            .limit(1)
        if (!existing) return fail("Sponsor not found.")

        return ok(
            await issueSponsorLogoUpload({
                sponsorId,
                contentType,
                contentLength
            })
        )
    }
)

export const finalizeSponsorLogoUpload = withAction(
    async (
        sponsorIdInput: number,
        filename: string
    ): Promise<ActionResult<{ logoPath: string; logoUrl: string | null }>> => {
        await requirePermission("sponsors:manage")
        const session = await requireSession()
        const sponsorId = requirePositiveInt(sponsorIdInput, "sponsor")

        const result = await finalizeSponsorLogo({
            sponsorId,
            filename: typeof filename === "string" ? filename : "",
            actorUserId: session.user.id
        })

        revalidateSponsorPages()
        return ok(result, "Logo uploaded.")
    }
)
