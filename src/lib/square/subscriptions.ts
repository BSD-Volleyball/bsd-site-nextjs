import { squareClient, locationId } from "./client"
import { db } from "@/database/db"
import { subscriptions } from "@/database/schema"
import { eq } from "drizzle-orm"
import { randomUUID } from "crypto"

export async function getSubscription(subscriptionId: string) {
    const response = await squareClient.subscriptions.get({
        subscriptionId
    })
    return response.subscription
}

export async function createSubscription(
    customerId: string,
    planVariationId: string,
    userId: string,
    planName: string,
    cardId?: string
) {
    const response = await squareClient.subscriptions.create({
        idempotencyKey: randomUUID(),
        locationId,
        customerId,
        planVariationId,
        cardId
    })

    const subscription = response.subscription
    if (!subscription?.id) {
        throw new Error("Failed to create subscription")
    }

    await db.insert(subscriptions).values({
        id: randomUUID(),
        plan: planName,
        referenceId: userId,
        squareCustomerId: customerId,
        squareSubscriptionId: subscription.id,
        status: subscription.status?.toLowerCase() || "pending",
        periodStart: subscription.startDate
            ? new Date(subscription.startDate)
            : null,
        periodEnd: subscription.chargedThroughDate
            ? new Date(subscription.chargedThroughDate)
            : null,
        cancelAtPeriodEnd: false,
        seats: 1
    })

    return subscription
}

export async function updateSubscription(
    subscriptionId: string,
    newPlanVariationId: string
) {
    const response = await squareClient.subscriptions.swapPlan({
        subscriptionId,
        newPlanVariationId
    })

    return response.subscription
}

export async function cancelSubscription(subscriptionId: string) {
    const response = await squareClient.subscriptions.cancel({
        subscriptionId
    })

    if (response.subscription) {
        await db
            .update(subscriptions)
            .set({
                cancelAtPeriodEnd: true,
                status: response.subscription.status?.toLowerCase()
            })
            .where(eq(subscriptions.squareSubscriptionId, subscriptionId))
    }

    return response.subscription
}

export async function pauseSubscription(subscriptionId: string) {
    const response = await squareClient.subscriptions.pause({
        subscriptionId,
        pauseReason: "User requested pause"
    })
    return response.subscription
}

export async function resumeSubscription(subscriptionId: string) {
    const response = await squareClient.subscriptions.resume({
        subscriptionId
    })
    return response.subscription
}
