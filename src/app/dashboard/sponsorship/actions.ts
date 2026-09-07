"use server"

import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { sponsors, sponsorships } from "@/database/schema"
import {
    type ActionResult,
    ActionError,
    ok,
    requireSeasonConfig,
    withAction
} from "@/next/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import { withTransientRetry } from "@/lib/db-retry"
import { buildSponsorshipReceiptHtml } from "@/lib/email-html"
import { sendMail } from "@/lib/email/send"
import { logger } from "@/lib/logger"
import { getSessionUser } from "@/next/session"
import { formatSeasonLabel, getSeasonConfig } from "@/lib/site-config"
import {
    finalizeSponsorLogo,
    getContactDisplay,
    issueSponsorLogoUpload,
    markSponsorshipPaid,
    normalizeSponsorDetails,
    notifyAdminsSponsorshipPaid
} from "@/lib/sponsors"
import { getSquareClient } from "@/lib/square"

// Same shape as the season/tournament payment actions so the client can
// share its result handling (and the "do NOT pay again" path can carry the
// Square payment id even on failure).
export interface SponsorshipPaymentResult {
    status: boolean
    message: string
    paymentId?: string
    receiptUrl?: string
}

function revalidateSponsorPages() {
    revalidatePath("/dashboard/sponsorship")
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/manage-sponsors")
    revalidatePath("/sponsors")
    revalidatePath("/")
}

/**
 * The sponsor the current user is the contact for in the current season.
 * Throws Unauthorized when there is no session or no sponsorship, so every
 * action below reads as "you may only touch your own sponsorship". Callers
 * still fetch the session themselves: the authz checker wants the guard
 * literally inside each exported action.
 */
async function requireOwnSponsorship(sessionUser: { id: string } | null) {
    if (!sessionUser) throw new ActionError("Unauthorized.")
    const config = await requireSeasonConfig()
    const own = await loadOwnSponsorship(sessionUser.id, config.seasonId)
    return { userId: sessionUser.id, config, own }
}

async function loadOwnSponsorship(userId: string, seasonId: number) {
    const [row] = await db
        .select({
            sponsorshipId: sponsorships.id,
            sponsorId: sponsors.id,
            sponsorName: sponsors.name,
            amount: sponsorships.amount,
            status: sponsorships.status
        })
        .from(sponsorships)
        .innerJoin(sponsors, eq(sponsorships.sponsor_id, sponsors.id))
        .where(
            and(
                eq(sponsorships.season, seasonId),
                eq(sponsors.contact_user, userId)
            )
        )
        .limit(1)
    if (!row) throw new ActionError("Unauthorized.")
    return row
}

export async function submitSponsorshipPayment(
    sourceId: string
): Promise<SponsorshipPaymentResult> {
    const sessionUser = await getSessionUser()
    if (!sessionUser) {
        return {
            status: false,
            message: "You need to be logged in to make a payment."
        }
    }

    try {
        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return { status: false, message: "Season not found." }
        }

        let own: Awaited<ReturnType<typeof loadOwnSponsorship>>
        try {
            own = await loadOwnSponsorship(sessionUser.id, config.seasonId)
        } catch {
            return {
                status: false,
                message:
                    "No sponsorship is set up for your account this season."
            }
        }
        if (own.status === "paid") {
            return {
                status: false,
                message: "This sponsorship is already paid. Thank you!"
            }
        }

        // The amount is whatever the admin recorded — never the client's.
        const amount = own.amount
        const amountCents = BigInt(Math.round(Number.parseFloat(amount) * 100))
        if (amountCents <= 0n) {
            return { status: false, message: "Invalid sponsorship amount." }
        }

        const seasonLabel = formatSeasonLabel(config)
        const response = await getSquareClient().payments.create({
            idempotencyKey: randomUUID(),
            sourceId,
            amountMoney: { currency: "USD", amount: amountCents },
            buyerEmailAddress: sessionUser.email,
            note: `Volleyball ${seasonLabel} Sponsorship - ${own.sponsorName}`
        })

        const payment = response.payment
        if (!payment) {
            return {
                status: false,
                message: "Payment processing failed. Please try again."
            }
        }

        // The card is charged from here on. Persist inside one retried
        // transaction; if that still fails, say so loudly and stop the
        // member from paying twice.
        try {
            await withTransientRetry(() =>
                db.transaction(async (tx) => {
                    const flipped = await markSponsorshipPaid(tx, {
                        sponsorshipId: own.sponsorshipId,
                        method: "square",
                        amountPaid: amount,
                        orderId: payment.id,
                        receiptUrl: payment.receiptUrl
                    })
                    if (!flipped) {
                        throw new Error(
                            "Sponsorship was no longer pending when recording payment"
                        )
                    }
                    await logAuditEntry(
                        {
                            userId: sessionUser.id,
                            action: "update",
                            entityType: "sponsorships",
                            entityId: own.sponsorshipId,
                            summary: `Paid $${amount} sponsorship for ${own.sponsorName} (${seasonLabel}) via Square ${payment.id}`
                        },
                        tx
                    )
                })
            )
        } catch (dbError) {
            logger.error(
                "CRITICAL: Square payment succeeded but the sponsorship transaction failed — manual reconciliation required.",
                {
                    paymentId: payment.id,
                    userId: sessionUser.id,
                    sponsorshipId: own.sponsorshipId,
                    amount
                },
                dbError
            )
            return {
                status: false,
                message:
                    "Your payment went through, but we hit a problem recording it. Please contact us and do NOT pay again — we'll mark your sponsorship paid manually.",
                paymentId: payment.id,
                receiptUrl: payment.receiptUrl
            }
        }

        // Awaited: work after a serverless response is not guaranteed to run.
        const contact = await getContactDisplay(sessionUser.id)
        await sendMail({
            mode: { kind: "transactional", category: "sponsorship_receipt" },
            recipients: [{ userId: sessionUser.id, email: sessionUser.email }],
            subject: `Sponsorship payment received — ${own.sponsorName}`,
            htmlBody: buildSponsorshipReceiptHtml({
                firstName:
                    contact?.firstName ?? sessionUser.email.split("@")[0],
                sponsorName: own.sponsorName,
                seasonLabel,
                amountPaid: amount,
                receiptUrl: payment.receiptUrl
            }),
            tag: "sponsorship-receipt"
        })
        await notifyAdminsSponsorshipPaid({
            sponsorName: own.sponsorName,
            contactName: contact?.fullName ?? sessionUser.email,
            amount,
            method: "square",
            actorUserId: sessionUser.id
        })

        revalidateSponsorPages()
        return {
            status: true,
            message: "Payment successful! Thank you for sponsoring the league.",
            paymentId: payment.id,
            receiptUrl: payment.receiptUrl
        }
    } catch (error) {
        logger.error(
            "Sponsorship payment error",
            { userId: sessionUser.id },
            error
        )
        return {
            status: false,
            message:
                "An error occurred while processing your payment. Please try again."
        }
    }
}

export const updateMySponsorDetails = withAction(
    async (input: {
        name: string
        website: string | null
        blurb: string | null
    }): Promise<ActionResult<void>> => {
        const { userId, own } = await requireOwnSponsorship(
            await getSessionUser()
        )
        const details = normalizeSponsorDetails(input)

        await db
            .update(sponsors)
            .set({ ...details, updated_at: new Date() })
            .where(eq(sponsors.id, own.sponsorId))

        await logAuditEntry({
            userId,
            action: "update",
            entityType: "sponsors",
            entityId: own.sponsorId,
            summary: `Sponsor contact updated details for ${details.name}`
        })

        revalidateSponsorPages()
        return ok(undefined, "Details saved.")
    }
)

export const createMySponsorLogoUpload = withAction(
    async (
        contentType: string,
        contentLength: number
    ): Promise<ActionResult<{ uploadUrl: string; filename: string }>> => {
        const { own } = await requireOwnSponsorship(await getSessionUser())
        return ok(
            await issueSponsorLogoUpload({
                sponsorId: own.sponsorId,
                contentType,
                contentLength
            })
        )
    }
)

export const finalizeMySponsorLogoUpload = withAction(
    async (
        filename: string
    ): Promise<ActionResult<{ logoPath: string; logoUrl: string | null }>> => {
        const { userId, own } = await requireOwnSponsorship(
            await getSessionUser()
        )
        const result = await finalizeSponsorLogo({
            sponsorId: own.sponsorId,
            filename: typeof filename === "string" ? filename : "",
            actorUserId: userId
        })
        revalidateSponsorPages()
        return ok(result, "Logo uploaded.")
    }
)
