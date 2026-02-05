"use server"

import { SquareClient, SquareEnvironment } from "square"
import { randomUUID } from "node:crypto"
import { readFileSync } from "fs"
import { join } from "path"
import { Resend } from "resend"
import { EmailTemplate } from "@daveyplate/better-auth-ui/server"
import React from "react"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { seasons, signups, users } from "@/database/schema"
import { eq, and } from "drizzle-orm"
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

const resend = new Resend(process.env.RESEND_API_KEY)
const logoContent = readFileSync(join(process.cwd(), "public", "logo.png"))

export interface SignupFormData {
    age: string
    captain: string
    pair: boolean
    pairPick: string | null
    pairReason: string
    datesMissing: string
    play1stWeek: boolean
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

    // Build payment details based on whether there was a discount
    let paymentDetails: React.ReactNode
    if (discountInfo) {
        const isFree = parseFloat(amountPaid) === 0
        if (isFree) {
            paymentDetails = React.createElement(
                React.Fragment,
                null,
                React.createElement(
                    "p",
                    null,
                    "Your registration is fully covered by your discount!"
                ),
                React.createElement(
                    "p",
                    { style: { fontSize: "14px", color: "#666" } },
                    `Original fee: $${discountInfo.originalAmount}`,
                    React.createElement("br"),
                    `Your discount: ${discountInfo.percentage}% off`,
                    React.createElement("br"),
                    "Amount paid: $0.00"
                )
            )
        } else {
            const savings = (
                parseFloat(discountInfo.originalAmount) - parseFloat(amountPaid)
            ).toFixed(2)
            paymentDetails = React.createElement(
                "p",
                { style: { fontSize: "14px", color: "#666" } },
                `Original fee: $${discountInfo.originalAmount}`,
                React.createElement("br"),
                `Your discount: ${discountInfo.percentage}% off (-$${savings})`,
                React.createElement("br"),
                `You paid: $${amountPaid}`
            )
        }
    } else {
        paymentDetails = React.createElement(
            "p",
            null,
            `Thank you for registering for the ${seasonLabel} season! Your payment of $${amountPaid} has been received.`
        )
    }

    try {
        await resend.emails.send({
            from: site.mailFrom,
            to: email,
            subject: `You're registered for BSD ${seasonLabel}!`,
            react: EmailTemplate({
                heading: "Registration Confirmed!",
                content: React.createElement(
                    React.Fragment,
                    null,
                    React.createElement("p", null, `Hi ${firstName},`),
                    paymentDetails,
                    React.createElement(
                        "p",
                        null,
                        "We'll be in touch with more details as the season approaches, including team assignments and the game schedule."
                    ),
                    React.createElement(
                        "p",
                        null,
                        "If you have any questions, feel free to reach out to us at ",
                        React.createElement(
                            "a",
                            { href: `mailto:${site.mailSupport}` },
                            site.mailSupport
                        ),
                        "."
                    )
                ),
                action: receiptUrl ? "View Receipt" : "Go to Dashboard",
                url: receiptUrl || `${site.url}/dashboard`,
                siteName: site.name,
                baseUrl: site.url,
                imageUrl: "cid:logo"
            }),
            attachments: [{
                filename: "logo.png",
                content: logoContent,
                contentType: "image/png",
                inlineContentId: "logo"
            }]
        })
    } catch (error) {
        console.error("Failed to send signup confirmation email:", error)
    }
}

export interface PaymentResult {
    success: boolean
    message: string
    paymentId?: string
    receiptUrl?: string
}

export async function fetchSeasonConfig(): Promise<SeasonConfig> {
    return getSeasonConfig()
}

export async function getUsers(): Promise<{ id: string; name: string }[]> {
    const allUsers = await db
        .select({
            id: users.id,
            first_name: users.first_name,
            last_name: users.last_name,
            preffered_name: users.preffered_name
        })
        .from(users)
        .orderBy(users.last_name, users.first_name)

    return allUsers.map((u) => {
        const preferredPart = u.preffered_name ? ` (${u.preffered_name})` : ""
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
            success: false,
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
            // Look up the season from database config
            const [season] = await db
                .select({ id: seasons.id })
                .from(seasons)
                .where(
                    and(
                        eq(seasons.year, config.seasonYear),
                        eq(seasons.season, config.seasonName)
                    )
                )
                .limit(1)

            if (season) {
                // Create signup record
                await db.insert(signups).values({
                    season: season.id,
                    player: session.user.id,
                    order_id: response.payment.id,
                    amount_paid: finalAmount,
                    age: formData.age,
                    captain: formData.captain,
                    pair: formData.pair,
                    pair_pick: formData.pairPick,
                    pair_reason: formData.pairReason,
                    dates_missing: formData.datesMissing,
                    play_1st_week: formData.play1stWeek,
                    created_at: new Date()
                })

                // Mark discount as used after successful payment
                if (discountId && discountInfo) {
                    await markDiscountAsUsed(discountId)
                }

                // Get user's first name for the email
                const [user] = await db
                    .select({
                        firstName: users.first_name,
                        preferredName: users.preffered_name
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
                success: true,
                message:
                    "Payment successful! You are now registered for the season.",
                paymentId: response.payment.id,
                receiptUrl: response.payment.receiptUrl
            }
        }

        return {
            success: false,
            message: "Payment processing failed. Please try again."
        }
    } catch (error) {
        console.error("Payment error:", error)
        return {
            success: false,
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
            success: false,
            message: "You need to be logged in to register."
        }
    }

    try {
        // Validate the discount is 100% and belongs to this user
        const discount = await getActiveDiscountForUser(session.user.id)
        if (!discount || discount.id !== discountId) {
            return {
                success: false,
                message: "Invalid or expired discount."
            }
        }

        const discountPercentage = parseFloat(discount.percentage)
        if (discountPercentage < 100) {
            return {
                success: false,
                message: "This discount requires payment."
            }
        }

        // Get config from database
        const config = await getSeasonConfig()
        const originalAmount = getCurrentSeasonAmount(config)

        // Look up the season from database config
        const [season] = await db
            .select({ id: seasons.id })
            .from(seasons)
            .where(
                and(
                    eq(seasons.year, config.seasonYear),
                    eq(seasons.season, config.seasonName)
                )
            )
            .limit(1)

        if (!season) {
            return {
                success: false,
                message: "Season not found."
            }
        }

        // Create signup record with $0 amount
        await db.insert(signups).values({
            season: season.id,
            player: session.user.id,
            order_id: `FREE-${discountId}`,
            amount_paid: "0",
            age: formData.age,
            captain: formData.captain,
            pair: formData.pair,
            pair_pick: formData.pairPick,
            pair_reason: formData.pairReason,
            dates_missing: formData.datesMissing,
            play_1st_week: formData.play1stWeek,
            created_at: new Date()
        })

        // Mark discount as used
        await markDiscountAsUsed(discountId)

        // Get user's first name for the email
        const [user] = await db
            .select({
                firstName: users.first_name,
                preferredName: users.preffered_name
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
            success: true,
            message:
                "Registration complete! You are now registered for the season."
        }
    } catch (error) {
        console.error("Free signup error:", error)
        return {
            success: false,
            message:
                "An error occurred while processing your registration. Please try again."
        }
    }
}
