"use server"

import { SquareClient, SquareEnvironment } from "square"
import { randomUUID } from "node:crypto"
import { getSessionUser } from "@/lib/rbac"
import { db } from "@/database/db"
import { signups, users, waitlist, userUnavailability } from "@/database/schema"
import { eq, and, count } from "drizzle-orm"
import { getSeasonConfig, getCurrentSeasonAmount } from "@/lib/site-config"
import {
    getActiveDiscountForUser,
    markDiscountAsUsed,
    calculateDiscountedAmount
} from "@/lib/discount"
import { logAuditEntry } from "@/lib/audit-log"
import {
    logAvailabilityChange,
    selectEventDates
} from "@/lib/availability-audit"
import { sendMail } from "@/lib/email/send"
import { buildSignupConfirmationHtml } from "@/lib/email-html"
import { getActiveWaiver, recordWaiverAcceptance } from "@/lib/waivers"
import { logger } from "@/lib/logger"
import { AGE_GROUPS } from "@/lib/age-groups"

export interface SignupFormData {
    age: string
    captain: string
    pair: boolean
    pairPick: string | null
    pairReason: string
    refInterest: boolean
    tryoutHelp: boolean
    unavailableEventIds: number[]
}

const getSquareClient = () => {
    return new SquareClient({
        token: process.env.SQUARE_ACCESS_TOKEN,
        environment:
            process.env.SQUARE_ENVIRONMENT === "production"
                ? SquareEnvironment.Production
                : SquareEnvironment.Sandbox
    })
}

async function sendSignupConfirmationEmail(
    userId: string,
    email: string,
    firstName: string,
    seasonName: string,
    seasonYear: number,
    amountPaid: string,
    receiptUrl?: string,
    discountInfo?: { originalAmount: string; percentage: string }
) {
    const seasonLabel = `${seasonName.charAt(0).toUpperCase() + seasonName.slice(1)} ${seasonYear}`

    // Build amount display string
    let amountDisplay = amountPaid
    if (discountInfo) {
        const isFree = parseFloat(amountPaid) === 0
        if (isFree) {
            amountDisplay = "0"
        }
    }

    // Transactional: a receipt is owed regardless of preferences or
    // suppression state. sendMail never throws, so a mail failure cannot
    // undo a payment that already succeeded.
    await sendMail({
        mode: { kind: "transactional", category: "signup_confirmation" },
        recipients: [{ userId, email }],
        subject: `You're registered for ${seasonLabel}!`,
        htmlBody: buildSignupConfirmationHtml({
            firstName,
            seasonLabel,
            amountPaid: amountDisplay,
            receiptUrl
        }),
        tag: "signup-confirmation"
    })
}

export interface PaymentResult {
    status: boolean
    message: string
    paymentId?: string
    receiptUrl?: string
    shouldRefresh?: boolean
}

async function validateFinalSignupAvailability(
    userId: string,
    seasonId: number,
    maxPlayers: number
): Promise<{
    ok: boolean
    message?: string
    shouldRefresh?: boolean
}> {
    const [existingSignup] = await db
        .select({ id: signups.id })
        .from(signups)
        .where(and(eq(signups.season, seasonId), eq(signups.player, userId)))
        .limit(1)

    if (existingSignup) {
        return {
            ok: false,
            message: "You are already registered for this season.",
            shouldRefresh: true
        }
    }

    if (!Number.isFinite(maxPlayers) || maxPlayers <= 0) {
        return { ok: true }
    }

    const [waitlistEntry] = await db
        .select({ approved: waitlist.approved })
        .from(waitlist)
        .where(and(eq(waitlist.season, seasonId), eq(waitlist.user, userId)))
        .limit(1)

    if (waitlistEntry?.approved) {
        return { ok: true }
    }

    const [signupCount] = await db
        .select({ total: count() })
        .from(signups)
        .where(eq(signups.season, seasonId))

    if ((signupCount?.total ?? 0) >= maxPlayers) {
        return {
            ok: false,
            message:
                "We are at the max number of players for this season. Please join the waitlist from your dashboard.",
            shouldRefresh: true
        }
    }

    return { ok: true }
}

// Rejects malformed signup payloads before any money moves. Server actions
// are a network boundary — the wizard enforces these shapes client-side, but
// a crafted request can send anything.
async function validateSignupFormData(
    formData: SignupFormData
): Promise<string | null> {
    // The stored value is matched exactly ("20+") when deciding whether to skip
    // the age question on a later signup, so only known groups may be written.
    if (!AGE_GROUPS.some((group) => group.value === formData.age)) {
        return "Invalid age selection."
    }
    if (
        typeof formData.pairReason === "string" &&
        formData.pairReason.length > 1000
    ) {
        return "Pair reason is too long."
    }
    if (
        !Array.isArray(formData.unavailableEventIds) ||
        formData.unavailableEventIds.some(
            (id) => !Number.isInteger(id) || id <= 0
        )
    ) {
        return "Invalid unavailability selection."
    }
    if (formData.pairPick) {
        const [pairUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, formData.pairPick))
            .limit(1)
        if (!pairUser) {
            return "Selected pair player could not be found."
        }
    }
    return null
}

// Retries a database operation on transient failures: deadlocks (e.g. a
// concurrent migration holding exclusive locks), serialization conflicts,
// and dropped pooler connections — the failure modes that can strand a
// player who has already been charged. Non-transient errors rethrow
// immediately.
const TRANSIENT_PG_CODES = new Set([
    "40001",
    "40P01",
    "57P01",
    "08003",
    "08006"
])

function isTransientDbError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false
    const e = error as { code?: string; message?: string; cause?: unknown }
    if (e.code && TRANSIENT_PG_CODES.has(e.code)) return true
    if (
        typeof e.message === "string" &&
        (e.message.includes("Connection terminated") ||
            e.message.includes("ECONNRESET"))
    ) {
        return true
    }
    return e.cause ? isTransientDbError(e.cause) : false
}

async function withTransientRetry<T>(
    fn: () => Promise<T>,
    attempts = 3
): Promise<T> {
    let lastError: unknown
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error
            if (attempt === attempts || !isTransientDbError(error)) {
                throw error
            }
            logger.warn("Transient DB error — retrying transaction", {
                attempt
            })
            await new Promise((resolve) => setTimeout(resolve, attempt * 300))
        }
    }
    throw lastError
}

export async function submitSeasonPayment(
    sourceId: string,
    formData: SignupFormData,
    waiverId: number,
    discountId?: number
): Promise<PaymentResult> {
    const sessionUser = await getSessionUser()
    if (!sessionUser) {
        return {
            status: false,
            message: "You need to be logged in to make a payment."
        }
    }

    const activeWaiver = await getActiveWaiver()
    if (!activeWaiver || activeWaiver.id !== waiverId) {
        return {
            status: false,
            message:
                "The waiver was updated while you were signing up. Please reload and re-confirm the current waiver."
        }
    }

    const validationError = await validateSignupFormData(formData)
    if (validationError) {
        return { status: false, message: validationError }
    }

    try {
        // Get config from database
        const config = await getSeasonConfig()
        const originalAmount = getCurrentSeasonAmount(config)
        let finalAmount = originalAmount
        let discountInfo:
            | { originalAmount: string; percentage: string }
            | undefined

        // Apply discount if provided and valid
        if (discountId) {
            const discount = await getActiveDiscountForUser(
                sessionUser.id,
                "season"
            )
            if (discount && discount.id === discountId) {
                finalAmount = calculateDiscountedAmount(
                    originalAmount,
                    discount.percentage
                )
                discountInfo = {
                    originalAmount,
                    percentage: discount.percentage
                }
            }
        }

        const amountCents = BigInt(Math.round(parseFloat(finalAmount) * 100))

        if (!config.seasonId) {
            return {
                status: false,
                message: "Season not found."
            }
        }

        const availabilityCheck = await validateFinalSignupAvailability(
            sessionUser.id,
            config.seasonId,
            config.maxPlayers
        )

        if (!availabilityCheck.ok) {
            return {
                status: false,
                message:
                    availabilityCheck.message ||
                    "Signups are currently unavailable.",
                shouldRefresh: availabilityCheck.shouldRefresh
            }
        }

        const client = getSquareClient()
        const response = await client.payments.create({
            idempotencyKey: randomUUID(),
            sourceId,
            amountMoney: {
                currency: "USD",
                amount: amountCents
            },
            buyerEmailAddress: sessionUser.email,
            note: `Volleyball ${config.seasonName} ${config.seasonYear} Season Payment - ${sessionUser.name || sessionUser.email}`
        })

        if (response.payment) {
            const payment = response.payment
            if (config.seasonId) {
                const seasonId = config.seasonId
                // The card is already charged (unrecoverable from here), so
                // every follow-up write happens in one transaction: a player
                // must never end up charged with half a registration. The
                // whole transaction retries on transient failures (deadlock,
                // dropped pooler connection) — safe because a failed attempt
                // rolls back completely and signups (season, player) is
                // unique, so even a lost-commit-ack edge cannot double-insert.
                try {
                    await withTransientRetry(() =>
                        db.transaction(async (tx) => {
                            await recordWaiverAcceptance(
                                sessionUser.id,
                                activeWaiver.id,
                                undefined,
                                tx
                            )

                            const [newSignup] = await tx
                                .insert(signups)
                                .values({
                                    season: seasonId,
                                    player: sessionUser.id,
                                    order_id: payment.id,
                                    amount_paid: finalAmount,
                                    age: formData.age,
                                    captain: formData.captain,
                                    pair: formData.pair,
                                    pair_pick: formData.pairPick,
                                    pair_reason: formData.pairReason,
                                    ref_interest: formData.refInterest === true,
                                    tryout_help: formData.tryoutHelp === true,
                                    created_at: new Date()
                                })
                                .returning({ id: signups.id })

                            if (
                                formData.unavailableEventIds.length > 0 &&
                                newSignup
                            ) {
                                await tx.insert(userUnavailability).values(
                                    formData.unavailableEventIds.map(
                                        (eventId) => ({
                                            user_id: sessionUser.id,
                                            signup_id: newSignup.id,
                                            event_id: eventId
                                        })
                                    )
                                )
                            }

                            await logAvailabilityChange(
                                {
                                    userId: sessionUser.id,
                                    entityId: newSignup.id,
                                    events: await selectEventDates(
                                        formData.unavailableEventIds,
                                        tx
                                    ),
                                    context: "At signup"
                                },
                                tx
                            )

                            await tx
                                .delete(waitlist)
                                .where(
                                    and(
                                        eq(waitlist.season, seasonId),
                                        eq(waitlist.user, sessionUser.id)
                                    )
                                )

                            if (discountId && discountInfo) {
                                await markDiscountAsUsed(discountId, tx)
                            }

                            await logAuditEntry(
                                {
                                    userId: sessionUser.id,
                                    action: "create",
                                    entityType: "signups",
                                    summary: `Paid season signup ($${finalAmount}) for ${config.seasonName} ${config.seasonYear}${discountInfo ? ` (${discountInfo.percentage}% discount)` : ""}`
                                },
                                tx
                            )
                        })
                    )
                } catch (dbError) {
                    logger.error(
                        "CRITICAL: Square payment succeeded but the signup transaction failed — manual reconciliation required.",
                        {
                            paymentId: payment.id,
                            userId: sessionUser.id,
                            seasonId,
                            amount: finalAmount
                        },
                        dbError
                    )
                    return {
                        status: false,
                        message:
                            "Your payment went through, but we hit a problem finishing your registration. Please contact us and do NOT pay again — we'll complete your signup manually.",
                        paymentId: payment.id,
                        receiptUrl: payment.receiptUrl
                    }
                }

                // Get user's first name for the email
                const [user] = await db
                    .select({
                        firstName: users.first_name,
                        preferredName: users.preferred_name
                    })
                    .from(users)
                    .where(eq(users.id, sessionUser.id))
                    .limit(1)

                const firstName =
                    user?.preferredName ||
                    user?.firstName ||
                    sessionUser.email.split("@")[0]

                // Awaited on purpose. This used to be fire-and-forget to
                // shave a round-trip off the response, but work started
                // after a serverless response returns is not guaranteed to
                // run — which risked dropping both the receipt and its
                // notification_log row. A payment the member just waited on
                // can afford one more round-trip.
                await sendSignupConfirmationEmail(
                    sessionUser.id,
                    sessionUser.email,
                    firstName,
                    config.seasonName,
                    config.seasonYear,
                    finalAmount,
                    response.payment.receiptUrl,
                    discountInfo
                )
            }

            return {
                status: true,
                message:
                    "Payment successful! You are now registered for the season.",
                paymentId: response.payment.id,
                receiptUrl: response.payment.receiptUrl
            }
        }

        return {
            status: false,
            message: "Payment processing failed. Please try again."
        }
    } catch (error) {
        console.error("Payment error:", error)
        return {
            status: false,
            message:
                "An error occurred while processing your payment. Please try again."
        }
    }
}

export async function submitFreeSignup(
    formData: SignupFormData,
    discountId: number,
    waiverId: number
): Promise<PaymentResult> {
    const sessionUser = await getSessionUser()
    if (!sessionUser) {
        return {
            status: false,
            message: "You need to be logged in to register."
        }
    }

    const activeWaiver = await getActiveWaiver()
    if (!activeWaiver || activeWaiver.id !== waiverId) {
        return {
            status: false,
            message:
                "The waiver was updated while you were signing up. Please reload and re-confirm the current waiver."
        }
    }

    const validationError = await validateSignupFormData(formData)
    if (validationError) {
        return { status: false, message: validationError }
    }

    try {
        // Validate the discount is 100% and belongs to this user
        const discount = await getActiveDiscountForUser(
            sessionUser.id,
            "season"
        )
        if (!discount || discount.id !== discountId) {
            return {
                status: false,
                message: "Invalid or expired discount."
            }
        }

        const discountPercentage = parseFloat(discount.percentage)
        if (discountPercentage < 100) {
            return {
                status: false,
                message: "This discount requires payment."
            }
        }

        // Get config from database
        const config = await getSeasonConfig()
        const originalAmount = getCurrentSeasonAmount(config)

        if (!config.seasonId) {
            return {
                status: false,
                message: "Season not found."
            }
        }

        const availabilityCheck = await validateFinalSignupAvailability(
            sessionUser.id,
            config.seasonId,
            config.maxPlayers
        )

        if (!availabilityCheck.ok) {
            return {
                status: false,
                message:
                    availabilityCheck.message ||
                    "Signups are currently unavailable.",
                shouldRefresh: availabilityCheck.shouldRefresh
            }
        }

        const seasonId = config.seasonId
        await db.transaction(async (tx) => {
            await recordWaiverAcceptance(
                sessionUser.id,
                activeWaiver.id,
                undefined,
                tx
            )

            // Create signup record with $0 amount
            const [newSignup] = await tx
                .insert(signups)
                .values({
                    season: seasonId,
                    player: sessionUser.id,
                    order_id: `FREE-${discountId}`,
                    amount_paid: "0",
                    age: formData.age,
                    captain: formData.captain,
                    pair: formData.pair,
                    pair_pick: formData.pairPick,
                    pair_reason: formData.pairReason,
                    ref_interest: formData.refInterest === true,
                    tryout_help: formData.tryoutHelp === true,
                    created_at: new Date()
                })
                .returning({ id: signups.id })

            // Insert player unavailability rows
            if (formData.unavailableEventIds.length > 0 && newSignup) {
                await tx.insert(userUnavailability).values(
                    formData.unavailableEventIds.map((eventId) => ({
                        user_id: sessionUser.id,
                        signup_id: newSignup.id,
                        event_id: eventId
                    }))
                )
            }

            await logAvailabilityChange(
                {
                    userId: sessionUser.id,
                    entityId: newSignup.id,
                    events: await selectEventDates(
                        formData.unavailableEventIds,
                        tx
                    ),
                    context: "At signup"
                },
                tx
            )

            await tx
                .delete(waitlist)
                .where(
                    and(
                        eq(waitlist.season, seasonId),
                        eq(waitlist.user, sessionUser.id)
                    )
                )

            await markDiscountAsUsed(discountId, tx)

            await logAuditEntry(
                {
                    userId: sessionUser.id,
                    action: "create",
                    entityType: "signups",
                    summary: `Free signup for ${config.seasonName} ${config.seasonYear} (100% discount #${discountId})`
                },
                tx
            )
        })

        // Get user's first name for the email
        const [user] = await db
            .select({
                firstName: users.first_name,
                preferredName: users.preferred_name
            })
            .from(users)
            .where(eq(users.id, sessionUser.id))
            .limit(1)

        const firstName =
            user?.preferredName ||
            user?.firstName ||
            sessionUser.email.split("@")[0]

        // Awaited for the same reason as the paid path above.
        await sendSignupConfirmationEmail(
            sessionUser.id,
            sessionUser.email,
            firstName,
            config.seasonName,
            config.seasonYear,
            "0",
            undefined,
            {
                originalAmount,
                percentage: discount.percentage
            }
        )

        return {
            status: true,
            message:
                "Registration complete! You are now registered for the season."
        }
    } catch (error) {
        console.error("Free signup error:", error)
        return {
            status: false,
            message:
                "An error occurred while processing your registration. Please try again."
        }
    }
}
