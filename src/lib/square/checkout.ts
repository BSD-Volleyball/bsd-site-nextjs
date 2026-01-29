import { squareClient, locationId } from "./client"
import { randomUUID } from "crypto"

export interface CreateCheckoutParams {
    userId: string
    email: string
    planVariationId: string
    planName: string
    successUrl: string
    cancelUrl: string
}

export async function createCheckoutLink(
    params: CreateCheckoutParams
): Promise<string> {
    const { userId, planVariationId, planName, successUrl } = params

    const response = await squareClient.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        order: {
            locationId,
            lineItems: [
                {
                    quantity: "1",
                    catalogObjectId: planVariationId,
                    itemType: "ITEM"
                }
            ],
            metadata: {
                userId,
                planName
            }
        },
        checkoutOptions: {
            redirectUrl: successUrl,
            askForShippingAddress: false
        },
        paymentNote: `Subscription: ${planName}`
    })

    const checkoutUrl = response.paymentLink?.url
    if (!checkoutUrl) {
        throw new Error("Failed to create checkout link")
    }

    return checkoutUrl
}

export async function createSubscriptionCheckoutLink(
    params: CreateCheckoutParams
): Promise<string> {
    const { userId, planVariationId, planName, successUrl } = params

    const response = await squareClient.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        order: {
            locationId,
            lineItems: [
                {
                    quantity: "1",
                    catalogObjectId: planVariationId,
                    itemType: "ITEM"
                }
            ],
            metadata: {
                userId,
                planName,
                subscriptionFlow: "true"
            }
        },
        checkoutOptions: {
            redirectUrl: successUrl,
            askForShippingAddress: false,
            acceptedPaymentMethods: {
                applePay: true,
                googlePay: true,
                cashAppPay: true
            }
        },
        paymentNote: `Subscription: ${planName}`
    })

    const checkoutUrl = response.paymentLink?.url
    if (!checkoutUrl) {
        throw new Error("Failed to create subscription checkout link")
    }

    return checkoutUrl
}
