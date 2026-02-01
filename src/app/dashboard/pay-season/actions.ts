"use server"

import { SquareClient, SquareEnvironment } from "square"
import { randomUUID } from "crypto"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { seasons, signups } from "@/database/schema"
import { eq, and } from "drizzle-orm"

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

export async function submitSeasonPayment(sourceId: string): Promise<PaymentResult> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return {
            success: false,
            message: "You need to be logged in to make a payment."
        }
    }

    try {
        // Get amount from environment variable (in dollars), convert to cents
        const amountDollars = process.env.NEXT_PUBLIC_SEASON_AMOUNT || "100.00"
        const amountCents = BigInt(Math.round(parseFloat(amountDollars) * 100))

        // Get season configuration from environment
        const seasonYear = parseInt(process.env.SEASON_YEAR || "2005", 10)
        const seasonName = process.env.SEASON_NAME || "Fall"

        const client = getSquareClient()
        const response = await client.payments.create({
            idempotencyKey: randomUUID(),
            sourceId,
            amountMoney: {
                currency: "USD",
                amount: amountCents
            },
            buyerEmailAddress: session.user.email,
            note: `Volleyball ${seasonName} ${seasonYear} Season Payment - ${session.user.name || session.user.email}`
        })

        if (response.payment) {
            // Look up the season from environment variables
            const [season] = await db
                .select({ id: seasons.id })
                .from(seasons)
                .where(and(eq(seasons.year, seasonYear), eq(seasons.season, seasonName)))
                .limit(1)

            if (season) {
                // Create signup record
                await db.insert(signups).values({
                    season: season.id,
                    player: session.user.id,
                    order_id: response.payment.id,
                    amount_paid: amountDollars,
                    created_at: new Date()
                })
            }

            return {
                success: true,
                message: "Payment successful! You are now registered for the season.",
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
            message: "An error occurred while processing your payment. Please try again."
        }
    }
}
