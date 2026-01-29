"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { subscriptions } from "@/database/schema"
import { eq, and, or } from "drizzle-orm"
import {
    getSubscription as getSquareSubscription,
    updateSubscription as updateSquareSubscription,
    cancelSubscription as cancelSquareSubscription
} from "@/lib/square/subscriptions"
import { createSubscriptionCheckoutLink } from "@/lib/square/checkout"
import { getOrCreateSquareCustomer } from "@/lib/square/customers"
import { plans } from "./plans"

interface SessionUser {
    id: string
    email: string
    firstName: string
    lastName: string
}

export interface Subscription {
    id: string
    plan: string
    referenceId: string
    squareCustomerId: string | null
    squareSubscriptionId: string | null
    status: string | null
    periodStart: Date | null
    periodEnd: Date | null
    cancelAtPeriodEnd: boolean | null
    seats: number | null
    trialStart: Date | null
    trialEnd: Date | null
    limits?: { tokens: number }
}

export async function getActiveSubscription(): Promise<{
    status: boolean
    message?: string
    subscription: Subscription | null
}> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return {
            status: false,
            message: "You need to be logged in.",
            subscription: null
        }
    }

    try {
        const [activeSub] = await db
            .select()
            .from(subscriptions)
            .where(
                and(
                    eq(subscriptions.referenceId, (session.user as SessionUser).id),
                    or(
                        eq(subscriptions.status, "active"),
                        eq(subscriptions.status, "pending")
                    )
                )
            )
            .limit(1)

        if (activeSub) {
            if (activeSub.squareSubscriptionId) {
                try {
                    const squareSub = await getSquareSubscription(
                        activeSub.squareSubscriptionId
                    )
                    const plan = plans.find((p) => p.name === activeSub.plan)
                    return {
                        status: true,
                        subscription: {
                            ...activeSub,
                            status: squareSub?.status?.toLowerCase() || activeSub.status,
                            limits: plan?.limits
                        }
                    }
                } catch (error) {
                    console.error("Error fetching Square subscription:", error)
                }
            }

            const plan = plans.find((p) => p.name === activeSub.plan)
            return {
                status: true,
                subscription: {
                    ...activeSub,
                    limits: plan?.limits
                }
            }
        }

        return { status: true, subscription: null }
    } catch (error) {
        console.error(error)
        return {
            status: false,
            message: "Something went wrong.",
            subscription: null
        }
    }
}

export async function createSubscriptionCheckout(
    planName: string
): Promise<{ status: boolean; checkoutUrl?: string; message?: string }> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return { status: false, message: "You need to be logged in." }
    }

    const plan = plans.find((p) => p.name === planName)
    if (!plan) {
        return { status: false, message: "Invalid plan." }
    }

    try {
        const user = session.user as SessionUser
        await getOrCreateSquareCustomer(
            user.id,
            user.email,
            user.firstName,
            user.lastName
        )

        const checkoutUrl = await createSubscriptionCheckoutLink({
            userId: user.id,
            email: user.email,
            planVariationId: plan.catalogItemVariationId,
            planName: plan.name,
            successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true`,
            cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`
        })

        return { status: true, checkoutUrl }
    } catch (error) {
        console.error("Error creating checkout:", error)
        return { status: false, message: "Failed to create checkout." }
    }
}

export async function updateExistingSubscription(
    subId: string,
    newPlanName: string
): Promise<{ status: boolean; message: string }> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return { status: false, message: "You need to be logged in." }
    }

    const plan = plans.find((p) => p.name === newPlanName)
    if (!plan) {
        return { status: false, message: "Invalid plan." }
    }

    if (!subId) {
        return { status: false, message: "Invalid subscription ID." }
    }

    try {
        await updateSquareSubscription(subId, plan.catalogItemVariationId)

        await db
            .update(subscriptions)
            .set({ plan: plan.name })
            .where(eq(subscriptions.squareSubscriptionId, subId))

        return { status: true, message: "Subscription updated successfully!" }
    } catch (error) {
        console.error("Error updating subscription:", error)
        return {
            status: false,
            message: "Something went wrong while updating the subscription."
        }
    }
}

export async function cancelCurrentSubscription(): Promise<{
    status: boolean
    message: string
}> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return { status: false, message: "You need to be logged in." }
    }

    try {
        const user = session.user as SessionUser
        const [sub] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.referenceId, user.id))
            .limit(1)

        if (!sub?.squareSubscriptionId) {
            return { status: false, message: "No active subscription found." }
        }

        await cancelSquareSubscription(sub.squareSubscriptionId)

        return {
            status: true,
            message: "Subscription will be canceled at period end."
        }
    } catch (error) {
        console.error("Error canceling subscription:", error)
        return { status: false, message: "Failed to cancel subscription." }
    }
}
