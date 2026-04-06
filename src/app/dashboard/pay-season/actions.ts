"use server"

import { SquareClient, SquareEnvironment } from "square"
import { randomUUID } from "node:crypto"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { signups, users, waitlist, userUnavailability } from "@/database/schema"
import { eq, and, count } from "drizzle-orm"
import {
    getSeasonConfig,
    getCurrentSeasonAmount,
    type SeasonConfig
} from "@/lib/site-config"
import {
    getActiveDiscountForUser,
    markDiscountAsUsed,
    calculateDiscountedAmount
} from "@/lib/discount"
import { site } from "@/config/site"
import { logAuditEntry } from "@/lib/audit-log"
import { sendEmail, STREAM_OUTBOUND } from "@/lib/postmark"
import { buildSignupConfirmationHtml } from "@/lib/email-html"

export interface SignupFormData {
    age: string
    captain: string
    pair: boolean
    pairPick: string | null
    pairReason: string
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

    try {
        await sendEmail({
            from: site.mailFrom,
            to: email,
            subject: `You're registered for BSD ${seasonLabel}!`,
            htmlBody: buildSignupConfirmationHtml({
                firstName,
                seasonLabel,
                amountPaid: amountDisplay,
                receiptUrl
            }),
            stream: STREAM_OUTBOUND,
            tag: "signup-confirmation"
        })
    } catch (error) {
        console.error("Failed to send signup confirmation email:", error)
    }
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

export async function fetchSeasonConfig(): Promise<SeasonConfig> {
    return getSeasonConfig()
}

export async function getUsers(): Promise<{ id: string; name: string }[]> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return []

    const allUsers = await db
        .select({
            id: users.id,
            first_name: users.first_name,
            last_name: users.last_name,
            preferred_name: users.preferred_name
        })
        .from(users)
        .orderBy(users.last_name, users.first_name)

    return allUsers.map((u) => {
        const preferredPart = u.preferred_name ? ` (${u.preferred_name})` : ""
        return {
            id: u.id,
            name: `${u.first_name}${preferredPart} ${u.last_name}`
        }
    })
}

export async function submitSeasonPayment(
    sourceId: string,
    formData: SignupFormData,
    discountId?: number
): Promise<PaymentResult> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return {
            status: false,
            message: "You need to be logged in to make a payment."
        }
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
            const discount = await getActiveDiscountForUser(session.user.id)
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
            session.user.id,
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
            buyerEmailAddress: session.user.email,
            note: `Volleyball ${config.seasonName} ${config.seasonYear} Season Payment - ${session.user.name || session.user.email}`
        })

        if (response.payment) {
            if (config.seasonId) {
                // Create signup record
                const [newSignup] = await db
                    .insert(signups)
                    .values({
                        season: config.seasonId,
                        player: session.user.id,
                        order_id: response.payment.id,
                        amount_paid: finalAmount,
                        age: formData.age,
                        captain: formData.captain,
                        pair: formData.pair,
                        pair_pick: formData.pairPick,
                        pair_reason: formData.pairReason,
                        created_at: new Date()
                    })
                    .returning({ id: signups.id })

                // Insert player unavailability rows
                if (formData.unavailableEventIds.length > 0 && newSignup) {
                    await db.insert(userUnavailability).values(
                        formData.unavailableEventIds.map((eventId) => ({
                            user_id: session.user.id,
                            signup_id: newSignup.id,
                            event_id: eventId
                        }))
                    )
                }

                await db
                    .delete(waitlist)
                    .where(
                        and(
                            eq(waitlist.season, config.seasonId),
                            eq(waitlist.user, session.user.id)
                        )
                    )

                // Mark discount as used after successful payment
                if (discountId && discountInfo) {
                    await markDiscountAsUsed(discountId)
                }

                await logAuditEntry({
                    userId: session.user.id,
                    action: "create",
                    entityType: "signups",
                    summary: `Paid season signup ($${finalAmount}) for ${config.seasonName} ${config.seasonYear}${discountInfo ? ` (${discountInfo.percentage}% discount)` : ""}`
                })

                // Get user's first name for the email
                const [user] = await db
                    .select({
                        firstName: users.first_name,
                        preferredName: users.preferred_name
                    })
                    .from(users)
                    .where(eq(users.id, session.user.id))
                    .limit(1)

                const firstName =
                    user?.preferredName ||
                    user?.firstName ||
                    session.user.email.split("@")[0]

                // Send confirmation email (don't await to not block response)
                sendSignupConfirmationEmail(
                    session.user.email,
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
    discountId: number
): Promise<PaymentResult> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return {
            status: false,
            message: "You need to be logged in to register."
        }
    }

    try {
        // Validate the discount is 100% and belongs to this user
        const discount = await getActiveDiscountForUser(session.user.id)
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
            session.user.id,
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

        // Create signup record with $0 amount
        const [newSignup] = await db
            .insert(signups)
            .values({
                season: config.seasonId,
                player: session.user.id,
                order_id: `FREE-${discountId}`,
                amount_paid: "0",
                age: formData.age,
                captain: formData.captain,
                pair: formData.pair,
                pair_pick: formData.pairPick,
                pair_reason: formData.pairReason,
                created_at: new Date()
            })
            .returning({ id: signups.id })

        // Insert player unavailability rows
        if (formData.unavailableEventIds.length > 0 && newSignup) {
            await db.insert(userUnavailability).values(
                formData.unavailableEventIds.map((eventId) => ({
                    user_id: session.user.id,
                    signup_id: newSignup.id,
                    event_id: eventId
                }))
            )
        }

        await db
            .delete(waitlist)
            .where(
                and(
                    eq(waitlist.season, config.seasonId),
                    eq(waitlist.user, session.user.id)
                )
            )

        // Mark discount as used
        await markDiscountAsUsed(discountId)

        await logAuditEntry({
            userId: session.user.id,
            action: "create",
            entityType: "signups",
            summary: `Free signup for ${config.seasonName} ${config.seasonYear} (100% discount #${discountId})`
        })

        // Get user's first name for the email
        const [user] = await db
            .select({
                firstName: users.first_name,
                preferredName: users.preferred_name
            })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1)

        const firstName =
            user?.preferredName ||
            user?.firstName ||
            session.user.email.split("@")[0]

        // Send confirmation email with discount info
        sendSignupConfirmationEmail(
            session.user.email,
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
