import { NextRequest, NextResponse } from "next/server"
import {
    verifyWebhookSignature,
    handleWebhookEvent
} from "@/lib/square/webhooks"

export async function POST(request: NextRequest) {
    const body = await request.text()
    const signature = request.headers.get("x-square-hmacsha256-signature")
    const url = request.url

    if (!(await verifyWebhookSignature(body, signature, url))) {
        console.error("Invalid Square webhook signature")
        return NextResponse.json(
            { error: "Invalid signature" },
            { status: 401 }
        )
    }

    try {
        const event = JSON.parse(body)
        await handleWebhookEvent(event)

        return NextResponse.json({ received: true })
    } catch (error) {
        console.error("Error processing Square webhook:", error)
        return NextResponse.json(
            { error: "Webhook processing failed" },
            { status: 500 }
        )
    }
}

export async function GET() {
    return NextResponse.json({ status: "Square webhook endpoint active" })
}
