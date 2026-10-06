import "server-only"

import { aliasedTable, asc, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import { sponsors, sponsorships, users } from "@/database/schema"
import {
    type ActionResult,
    ok,
    requirePermission,
    requireSeasonConfig,
    withAction
} from "@/next/action-helpers"
import { formatSeasonLabel } from "@/lib/site-config"
import {
    type SponsorshipPaymentMethod,
    type SponsorshipStatus,
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
