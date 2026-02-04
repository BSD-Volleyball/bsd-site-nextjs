"use server"

import { SquareClient, SquareEnvironment } from "square"
import { randomUUID } from "crypto"
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
    formData: SignupFormData
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
        const amount = getCurrentSeasonAmount(config)
        const amountCents = BigInt(Math.round(parseFloat(amount) * 100))

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
                    amount_paid: amount,
                    age: formData.age,
                    captain: formData.captain,
                    pair: formData.pair,
                    pair_pick: formData.pairPick,
                    pair_reason: formData.pairReason,
                    dates_missing: formData.datesMissing,
                    play_1st_week: formData.play1stWeek,
                    created_at: new Date()
                })
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
