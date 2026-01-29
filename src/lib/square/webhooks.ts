import { WebhooksHelper } from "square"
import { db } from "@/database/db"
import { subscriptions, users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { randomUUID } from "crypto"

const WEBHOOK_SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!

export async function verifyWebhookSignature(
    body: string,
    signature: string | null,
    url: string
): Promise<boolean> {
    if (!signature || !WEBHOOK_SIGNATURE_KEY) {
        return false
    }

    return WebhooksHelper.verifySignature({
        requestBody: body,
        signatureHeader: signature,
        signatureKey: WEBHOOK_SIGNATURE_KEY,
        notificationUrl: url
    })
}

interface SquareWebhookEvent {
    merchant_id: string
    type: string
    event_id: string
    created_at: string
    data: {
        type: string
        id: string
        object: {
            subscription?: {
                id: string
                customer_id: string
                plan_variation_id: string
                status: string
                start_date?: string
                charged_through_date?: string
                canceled_date?: string
            }
            payment?: {
                id: string
                customer_id: string
                status: string
                order_id?: string
            }
            customer?: {
                id: string
                email_address: string
                reference_id?: string
            }
        }
    }
}

export async function handleWebhookEvent(event: SquareWebhookEvent) {
    switch (event.type) {
        case "subscription.created":
            await handleSubscriptionCreated(event)
            break
        case "subscription.updated":
            await handleSubscriptionUpdated(event)
            break
        case "subscription.canceled":
        case "subscription.deactivated":
            await handleSubscriptionCanceled(event)
            break
        case "payment.completed":
            await handlePaymentCompleted(event)
            break
        case "customer.created":
            await handleCustomerCreated(event)
            break
        default:
            console.log(`Unhandled webhook event type: ${event.type}`)
    }
}

async function handleSubscriptionCreated(event: SquareWebhookEvent) {
    const subscription = event.data.object.subscription
    if (!subscription) return

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.squareCustomerId, subscription.customer_id))
        .limit(1)

    if (!user) {
        console.error(
            `User not found for Square customer: ${subscription.customer_id}`
        )
        return
    }

    const existingSub = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.squareSubscriptionId, subscription.id))
        .limit(1)

    if (existingSub.length > 0) {
        return
    }

    await db.insert(subscriptions).values({
        id: randomUUID(),
        plan: subscription.plan_variation_id,
        referenceId: user.id,
        squareCustomerId: subscription.customer_id,
        squareSubscriptionId: subscription.id,
        status: subscription.status?.toLowerCase() || "active",
        periodStart: subscription.start_date
            ? new Date(subscription.start_date)
            : null,
        periodEnd: subscription.charged_through_date
            ? new Date(subscription.charged_through_date)
            : null,
        cancelAtPeriodEnd: false,
        seats: 1
    })
}

async function handleSubscriptionUpdated(event: SquareWebhookEvent) {
    const subscription = event.data.object.subscription
    if (!subscription) return

    await db
        .update(subscriptions)
        .set({
            status: subscription.status?.toLowerCase(),
            periodEnd: subscription.charged_through_date
                ? new Date(subscription.charged_through_date)
                : undefined
        })
        .where(eq(subscriptions.squareSubscriptionId, subscription.id))
}

async function handleSubscriptionCanceled(event: SquareWebhookEvent) {
    const subscription = event.data.object.subscription
    if (!subscription) return

    await db
        .update(subscriptions)
        .set({
            status: "canceled",
            cancelAtPeriodEnd: true
        })
        .where(eq(subscriptions.squareSubscriptionId, subscription.id))
}

async function handlePaymentCompleted(event: SquareWebhookEvent) {
    const payment = event.data.object.payment
    if (!payment) return

    console.log(`Payment completed: ${payment.id}`)
}

async function handleCustomerCreated(event: SquareWebhookEvent) {
    const customer = event.data.object.customer
    if (!customer?.reference_id) return

    await db
        .update(users)
        .set({ squareCustomerId: customer.id })
        .where(eq(users.id, customer.reference_id))
}
