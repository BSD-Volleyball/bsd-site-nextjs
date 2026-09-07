import "server-only"
import { and, asc, desc, eq } from "drizzle-orm"
import { type DbExecutor, db } from "@/database/db"
import { sponsors, sponsorships, users } from "@/database/schema"
import { playerPicBaseUrl } from "@/config/env"
import { site } from "@/config/site"
import { ActionError } from "@/lib/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import { buildSponsorshipPaidHtml } from "@/lib/email-html"
import { sendMail } from "@/lib/email/send"
import { createPlayerPictureUploadPresignedUrl, deleteR2Object } from "@/lib/r2"
import { getRecipientsWithRole } from "@/lib/rbac"
import {
    SPONSOR_LOGO_MAX_BYTES,
    buildSponsorLogoFilename,
    getSponsorLogoDbPath,
    getSponsorLogoExtension,
    getSponsorLogoObjectKey,
    isSponsorLogoFilenameFor,
    objectKeyFromLogoPath
} from "@/lib/sponsor-logo"
import { logger } from "@/lib/logger"
import { buildPlayerPictureUrl } from "@/lib/utils"

export type SponsorshipStatus = "pending" | "paid"
export type SponsorshipPaymentMethod = "square" | "manual"

/** Converts a stored logo path into an absolute URL, or null when unset. */
export function sponsorLogoUrl(logoPath: string | null): string | null {
    if (!logoPath) return null
    return buildPlayerPictureUrl(playerPicBaseUrl(), logoPath) || null
}

// ---------------------------------------------------------------------------
// Public listing
// ---------------------------------------------------------------------------

export interface PublicSponsor {
    id: number
    name: string
    website: string | null
    blurb: string | null
    logoUrl: string | null
}

/**
 * Paid sponsors for a season, richest first. Unpaid sponsorships never show:
 * the listing is part of what the sponsor is buying.
 */
export async function getPublicSponsors(
    seasonId: number
): Promise<PublicSponsor[]> {
    const rows = await db
        .select({
            id: sponsors.id,
            name: sponsors.name,
            website: sponsors.website,
            blurb: sponsors.blurb,
            logoPath: sponsors.logo_path
        })
        .from(sponsorships)
        .innerJoin(sponsors, eq(sponsorships.sponsor_id, sponsors.id))
        .where(
            and(
                eq(sponsorships.season, seasonId),
                eq(sponsorships.status, "paid")
            )
        )
        .orderBy(desc(sponsorships.amount), asc(sponsors.name))

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        website: row.website,
        blurb: row.blurb,
        logoUrl: sponsorLogoUrl(row.logoPath)
    }))
}

// ---------------------------------------------------------------------------
// Sponsor-contact view
// ---------------------------------------------------------------------------

export interface UserSponsorship {
    sponsorshipId: number
    sponsorId: number
    seasonId: number
    name: string
    website: string | null
    blurb: string | null
    logoPath: string | null
    logoUrl: string | null
    amount: string
    status: SponsorshipStatus
    paymentMethod: SponsorshipPaymentMethod | null
    amountPaid: string | null
    receiptUrl: string | null
    paidAt: Date | null
}

/**
 * The sponsorship a user is the contact for in the given season, or null.
 * Drives the dashboard card and the /dashboard/sponsorship page.
 */
export async function getSponsorshipForUser(
    userId: string,
    seasonId: number
): Promise<UserSponsorship | null> {
    const [row] = await db
        .select({
            sponsorshipId: sponsorships.id,
            sponsorId: sponsors.id,
            seasonId: sponsorships.season,
            name: sponsors.name,
            website: sponsors.website,
            blurb: sponsors.blurb,
            logoPath: sponsors.logo_path,
            amount: sponsorships.amount,
            status: sponsorships.status,
            paymentMethod: sponsorships.payment_method,
            amountPaid: sponsorships.amount_paid,
            receiptUrl: sponsorships.receipt_url,
            paidAt: sponsorships.paid_at
        })
        .from(sponsorships)
        .innerJoin(sponsors, eq(sponsorships.sponsor_id, sponsors.id))
        .where(
            and(
                eq(sponsorships.season, seasonId),
                eq(sponsors.contact_user, userId)
            )
        )
        .orderBy(desc(sponsorships.id))
        .limit(1)

    if (!row) return null

    return {
        ...row,
        logoUrl: sponsorLogoUrl(row.logoPath),
        status: row.status === "paid" ? "paid" : "pending",
        paymentMethod:
            row.paymentMethod === "square" || row.paymentMethod === "manual"
                ? row.paymentMethod
                : null
    }
}

// ---------------------------------------------------------------------------
// Payment write path
// ---------------------------------------------------------------------------

/**
 * The single transition from pending → paid, shared by the Square action and
 * the admin's manual mark-paid. The status guard in the WHERE clause makes a
 * repeat call a no-op, so a double-submit can never overwrite the record of
 * the payment that actually happened. Returns whether this call flipped it.
 */
export async function markSponsorshipPaid(
    executor: DbExecutor,
    params: {
        sponsorshipId: number
        method: SponsorshipPaymentMethod
        amountPaid: string
        orderId?: string
        receiptUrl?: string
        note?: string
        markedPaidBy?: string
    }
): Promise<boolean> {
    const updated = await executor
        .update(sponsorships)
        .set({
            status: "paid",
            payment_method: params.method,
            amount_paid: params.amountPaid,
            order_id: params.orderId ?? null,
            receipt_url: params.receiptUrl ?? null,
            paid_note: params.note?.trim() || null,
            marked_paid_by: params.markedPaidBy ?? null,
            paid_at: new Date()
        })
        .where(
            and(
                eq(sponsorships.id, params.sponsorshipId),
                eq(sponsorships.status, "pending")
            )
        )
        .returning({ id: sponsorships.id })

    return updated.length > 0
}

// ---------------------------------------------------------------------------
// Admin notification
// ---------------------------------------------------------------------------

/**
 * Tells the admins a sponsorship was paid. Staff mode: no opt-outs apply,
 * but Postmark suppressions still do. The actor (an admin marking it paid
 * by hand) already knows, so they are left off.
 */
export async function notifyAdminsSponsorshipPaid(params: {
    sponsorName: string
    contactName: string
    amount: string
    method: SponsorshipPaymentMethod
    note?: string | null
    actorUserId?: string
}): Promise<void> {
    const admins = await getRecipientsWithRole("admin")
    const recipients = admins.filter((a) => a.userId !== params.actorUserId)
    if (recipients.length === 0) return

    const manageUrl = `${site.url}/dashboard/manage-sponsors`
    await sendMail({
        mode: { kind: "staff", category: "sponsorship_paid" },
        recipients,
        subject: `${params.sponsorName} paid their sponsorship ($${params.amount})`,
        htmlBody: (r) =>
            buildSponsorshipPaidHtml({
                adminFirstName: r.firstName ?? "there",
                sponsorName: params.sponsorName,
                contactName: params.contactName,
                amount: params.amount,
                method: params.method,
                note: params.note,
                manageUrl
            }),
        tag: "sponsorship-paid"
    })
}

/** Display name for a sponsor contact, preferring the preferred name. */
export async function getContactDisplay(
    userId: string
): Promise<{ email: string; firstName: string; fullName: string } | null> {
    const [user] = await db
        .select({
            email: users.email,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    if (!user) return null
    const firstName = user.preferredName || user.firstName
    return {
        email: user.email,
        firstName,
        fullName: `${firstName} ${user.lastName}`
    }
}

// ---------------------------------------------------------------------------
// Input validation shared by the admin and sponsor-contact actions
// ---------------------------------------------------------------------------

const AMOUNT_PATTERN = /^\d{1,7}(\.\d{1,2})?$/

/**
 * Normalises an admin-typed dollar amount ("$1,250", "500.5") to the
 * two-decimal string the numeric column stores. Throws ActionError on
 * anything that is not a plain positive dollar figure.
 */
export function parseSponsorshipAmount(value: unknown): string {
    const cleaned =
        typeof value === "string" ? value.replace(/[$,\s]/g, "") : ""
    if (!AMOUNT_PATTERN.test(cleaned) || Number(cleaned) <= 0) {
        throw new ActionError("Amount must be a positive dollar amount.")
    }
    return Number(cleaned).toFixed(2)
}

export interface SponsorDetailsInput {
    name: string
    website: string | null
    blurb: string | null
}

export function normalizeSponsorDetails(input: SponsorDetailsInput): {
    name: string
    website: string | null
    blurb: string | null
} {
    const name = typeof input.name === "string" ? input.name.trim() : ""
    if (!name) throw new ActionError("Business name is required.")
    if (name.length > 120) throw new ActionError("Business name is too long.")

    let website: string | null = null
    if (typeof input.website === "string" && input.website.trim()) {
        const raw = input.website.trim()
        const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
        try {
            const url = new URL(withScheme)
            if (
                !/^https?:$/.test(url.protocol) ||
                !url.hostname.includes(".")
            ) {
                throw new Error("bad host")
            }
            website = url.toString().replace(/\/$/, "")
        } catch {
            throw new ActionError("Website must be a valid URL.")
        }
    }

    const blurb =
        typeof input.blurb === "string" && input.blurb.trim()
            ? input.blurb.trim()
            : null
    if (blurb && blurb.length > 500) {
        throw new ActionError("Blurb must be 500 characters or fewer.")
    }

    return { name, website, blurb }
}

// ---------------------------------------------------------------------------
// Logo upload — the same two-step presigned flow as player pictures
// ---------------------------------------------------------------------------

export async function issueSponsorLogoUpload(params: {
    sponsorId: number
    contentType: string
    contentLength: number
}): Promise<{ uploadUrl: string; filename: string }> {
    const extension = getSponsorLogoExtension(params.contentType)
    if (!extension) {
        throw new ActionError("Logo must be a PNG, JPEG, SVG, or WebP image.")
    }
    if (
        !Number.isInteger(params.contentLength) ||
        params.contentLength <= 0 ||
        params.contentLength > SPONSOR_LOGO_MAX_BYTES
    ) {
        throw new ActionError(
            `Logo must be between 1 byte and ${Math.round(SPONSOR_LOGO_MAX_BYTES / 1024 / 1024)} MB.`
        )
    }

    const filename = buildSponsorLogoFilename(params.sponsorId, extension)
    const uploadUrl = await createPlayerPictureUploadPresignedUrl({
        key: getSponsorLogoObjectKey(filename),
        contentType: params.contentType,
        contentLength: params.contentLength,
        maxContentLength: SPONSOR_LOGO_MAX_BYTES
    })
    return { uploadUrl, filename }
}

/**
 * Records the uploaded logo on the sponsor and removes the previous object.
 * The filename comes back from the browser, so it is re-validated against the
 * sponsor id before it is trusted.
 */
export async function finalizeSponsorLogo(params: {
    sponsorId: number
    filename: string
    actorUserId: string
}): Promise<{ logoPath: string; logoUrl: string | null }> {
    if (!isSponsorLogoFilenameFor(params.sponsorId, params.filename)) {
        throw new ActionError("Uploaded filename does not match this sponsor.")
    }

    const [existing] = await db
        .select({ name: sponsors.name, logoPath: sponsors.logo_path })
        .from(sponsors)
        .where(eq(sponsors.id, params.sponsorId))
        .limit(1)
    if (!existing) throw new ActionError("Sponsor not found.")

    const logoPath = getSponsorLogoDbPath(params.filename)
    await db
        .update(sponsors)
        .set({ logo_path: logoPath, updated_at: new Date() })
        .where(eq(sponsors.id, params.sponsorId))

    if (existing.logoPath && existing.logoPath !== logoPath) {
        try {
            await deleteR2Object(objectKeyFromLogoPath(existing.logoPath))
        } catch (error) {
            // An orphaned object is harmless; the new logo is already live.
            logger.warn("Failed to delete replaced sponsor logo", {
                sponsorId: params.sponsorId,
                key: existing.logoPath,
                error: error instanceof Error ? error.message : String(error)
            })
        }
    }

    await logAuditEntry({
        userId: params.actorUserId,
        action: "update",
        entityType: "sponsors",
        entityId: params.sponsorId,
        summary: `Uploaded logo for sponsor ${existing.name} as ${getSponsorLogoObjectKey(params.filename)}`
    })

    return { logoPath, logoUrl: sponsorLogoUrl(logoPath) }
}
