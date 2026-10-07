import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { logger } from "@/lib/logger"
import {
    handleBounce,
    handleSpamComplaint,
    handleSubscriptionChange
} from "@/lib/inbound/delivery-events"
import { handleInboundEmail } from "@/lib/inbound/inbound-email"
import {
    postmarkBounceSchema,
    postmarkInboundSchema,
    postmarkSpamComplaintSchema,
    postmarkSubscriptionChangeSchema
} from "@/lib/inbound/postmark-payloads"
import { parseSpooledEnvelope } from "@/lib/inbound/spool-envelope"
import { deleteR2Object, getR2Object } from "@/lib/r2"
import type { R2Scope } from "@/lib/r2-bucket"

// HTTP concerns only: credentials, payload parsing, the spool fetch/delete,
// dispatch by RecordType and the response. Inbound-mail processing lives in
// src/lib/inbound/.

// A spooled inbound message can carry up to 35 MB of attachments; fetching,
// parsing and re-uploading those needs more than the default budget.
export const maxDuration = 300

// ---------------------------------------------------------------------------
// Webhook token verification
// ---------------------------------------------------------------------------

function verifyWebhookAuth(request: NextRequest): boolean {
    const user = process.env.POSTMARK_WEBHOOK_USER
    const password = process.env.POSTMARK_WEBHOOK_PASSWORD
    if (!user || !password) {
        logger.error(
            "[postmark-webhook] POSTMARK_WEBHOOK_USER/PASSWORD not configured; rejecting request"
        )
        return false
    }

    const authHeader = request.headers.get("authorization")
    if (!authHeader?.startsWith("Basic ")) return false

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8")
    const sepIdx = decoded.indexOf(":")
    if (sepIdx < 0) return false
    const providedUser = decoded.slice(0, sepIdx)
    const providedPassword = decoded.slice(sepIdx + 1)

    const expected = Buffer.from(`${user}:${password}`, "utf-8")
    const provided = Buffer.from(`${providedUser}:${providedPassword}`, "utf-8")
    if (expected.length !== provided.length) return false
    return timingSafeEqual(expected, provided)
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** Route a Postmark payload — inline or spooled — to its handler. */
async function dispatchPostmarkPayload(payload: Record<string, unknown>) {
    // Postmark uses RecordType to distinguish webhook types
    if (payload.RecordType === "SubscriptionChange") {
        await handleSubscriptionChange(
            postmarkSubscriptionChangeSchema.parse(payload)
        )
        return
    }

    if (payload.RecordType === "Bounce") {
        await handleBounce(postmarkBounceSchema.parse(payload))
        return
    }

    if (payload.RecordType === "SpamComplaint") {
        await handleSpamComplaint(postmarkSpamComplaintSchema.parse(payload))
        return
    }

    // Inbound emails have no RecordType but have MessageID + From + To
    if (payload.MessageID && payload.From && !payload.RecordType) {
        await handleInboundEmail(postmarkInboundSchema.parse(payload))
        return
    }

    // Other webhook types (bounces, opens, etc.) — acknowledge but ignore
    logger.info("[postmark-webhook] Unhandled RecordType", {
        recordType: payload.RecordType ?? "unknown"
    })
}

/**
 * Process an inbound message the Worker spooled to R2. A 400 makes Postmark
 * retry through the Worker, which spools a fresh copy under a new key, so
 * the object is deleted only after success; failures leave it for the
 * bucket's lifecycle rule (and for debugging).
 */
async function handleSpooledInbound(
    payload: Record<string, unknown>
): Promise<NextResponse> {
    const envelope = parseSpooledEnvelope(payload)
    if (!envelope) {
        logger.warn("[postmark-webhook] Rejected malformed spool envelope", {
            spoolKey: String(payload.SpoolKey ?? "")
        })
        return NextResponse.json({ error: "Bad envelope" }, { status: 400 })
    }
    const { SpoolKey: spoolKey, ContentLength: contentLength } = envelope

    // The inbound Worker writes the spool to the private bucket. During the
    // cut-over (app deployed, Worker not yet redeployed) an object may still
    // land in the public bucket, so look there second and delete from
    // wherever it was found. Remove the fallback once the Worker is on the
    // private bucket and the public inbound-spool/ prefix is empty.
    let scope: R2Scope = "private"
    let object = await getR2Object(spoolKey, scope)
    if (!object) {
        scope = "public"
        object = await getR2Object(spoolKey, scope)
    }
    if (!object) {
        logger.error("[postmark-webhook] Spool object missing", { spoolKey })
        return NextResponse.json({ error: "Spool missing" }, { status: 400 })
    }
    if (
        object.contentLength !== null &&
        object.contentLength !== contentLength
    ) {
        logger.error("[postmark-webhook] Spool object length mismatch", {
            spoolKey,
            expected: contentLength,
            actual: object.contentLength
        })
        return NextResponse.json({ error: "Spool truncated" }, { status: 400 })
    }

    let inner: unknown
    try {
        inner = await new Response(object.body).json()
    } catch {
        logger.error("[postmark-webhook] Spool object is not JSON", {
            spoolKey
        })
        return NextResponse.json({ error: "Spool unreadable" }, { status: 400 })
    }
    if (typeof inner !== "object" || inner === null) {
        logger.error("[postmark-webhook] Spool object is not a JSON object", {
            spoolKey
        })
        return NextResponse.json({ error: "Spool unreadable" }, { status: 400 })
    }

    try {
        await dispatchPostmarkPayload(inner as Record<string, unknown>)
    } catch (error) {
        logger.error("[postmark-webhook] Spooled message failed", {
            spoolKey,
            error: error instanceof Error ? error.message : String(error)
        })
        throw error
    }

    try {
        await deleteR2Object(spoolKey, scope)
    } catch (error) {
        // Lifecycle expiry cleans it up; never fail a processed message here.
        logger.warn("[postmark-webhook] Could not delete spool object", {
            spoolKey,
            error: error instanceof Error ? error.message : String(error)
        })
    }
    logger.info("[postmark-webhook] Processed spooled message", {
        spoolKey,
        contentLength
    })
    return NextResponse.json({ received: true })
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    if (!verifyWebhookAuth(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const payload = (await request.json()) as Record<string, unknown>

        if (payload.RecordType === "BSDSpooledInbound") {
            return await handleSpooledInbound(payload)
        }

        await dispatchPostmarkPayload(payload)
        return NextResponse.json({ received: true })
    } catch (error) {
        logger.error(
            "[postmark-webhook] Webhook processing failed",
            undefined,
            error
        )
        return NextResponse.json(
            { error: "Webhook processing failed" },
            { status: 400 }
        )
    }
}
