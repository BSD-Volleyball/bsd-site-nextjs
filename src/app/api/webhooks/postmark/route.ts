import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { db } from "@/database/db"
import {
    concerns,
    inboundEmails,
    users,
    userRoles,
    emailSuppressions
} from "@/database/schema"
import { eq, and } from "drizzle-orm"
import { site } from "@/config/site"
import { sendBatchEmails } from "@/lib/postmark"
import {
    buildConcernNotificationHtml,
    buildInboundEmailNotificationHtml
} from "@/lib/email-html"

// ---------------------------------------------------------------------------
// Postmark Inbound Email Payload (subset of fields we use)
// https://postmarkapp.com/developer/webhooks/inbound-webhook
// ---------------------------------------------------------------------------

interface PostmarkInboundPayload {
    MessageID: string
    From: string
    FromName: string
    FromFull: { Email: string; Name: string }
    To: string
    ToFull: Array<{ Email: string; Name: string }>
    Subject: string
    TextBody: string
    HtmlBody: string
    Tag: string
    MessageStream: string
}

// ---------------------------------------------------------------------------
// Postmark Subscription Change Payload
// https://postmarkapp.com/developer/webhooks/subscription-change-webhook
// ---------------------------------------------------------------------------

interface PostmarkSubscriptionChangePayload {
    RecordType: "SubscriptionChange"
    MessageStream: string
    Recipient: string
    SuppressSending: boolean
    SuppressionReason: string | null
    Origin: string
    Timestamp: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFromAddress(from: string): {
    name: string | null
    email: string
} {
    const match = from.match(/^(.+?)\s*<(.+?)>$/)
    if (match) {
        return {
            name: match[1].trim().replace(/^"|"$/g, ""),
            email: match[2].trim()
        }
    }
    return { name: null, email: from.trim() }
}

async function notifyOmbudsmen(appUrl: string) {
    const ombudsmenRows = await db
        .select({ email: users.email })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.user_id, users.id))
        .where(eq(userRoles.role, "ombudsman"))

    const emails = [
        ...new Set(ombudsmenRows.map((r) => r.email).filter(Boolean))
    ]

    if (emails.length > 0) {
        await sendBatchEmails(
            emails.map((to) => ({
                from: site.mailFrom,
                to,
                subject: "New Concern Submitted via Email",
                htmlBody: buildConcernNotificationHtml(appUrl)
            }))
        )
    }
}

async function notifyAdmins(appUrl: string, subject: string, from: string) {
    const adminRows = await db
        .select({ email: users.email })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.user_id, users.id))
        .where(eq(userRoles.role, "admin"))

    const emails = [...new Set(adminRows.map((r) => r.email).filter(Boolean))]

    if (emails.length > 0) {
        await sendBatchEmails(
            emails.map((to) => ({
                from: site.mailFrom,
                to,
                subject: "New Inbound Email Received",
                htmlBody: buildInboundEmailNotificationHtml({
                    appUrl,
                    from,
                    subject
                })
            }))
        )
    }
}

// ---------------------------------------------------------------------------
// Inbound email handling
// ---------------------------------------------------------------------------

async function handleInboundEmail(payload: PostmarkInboundPayload) {
    const messageId = payload.MessageID
    const fromEmail =
        payload.FromFull?.Email ?? parseFromAddress(payload.From).email
    const fromName =
        payload.FromFull?.Name ?? parseFromAddress(payload.From).name
    const from = payload.From
    const subject = payload.Subject || "(No subject)"
    const bodyText = payload.TextBody || null
    const bodyHtml = payload.HtmlBody || null

    const toAddresses = payload.ToFull?.map((t) => t.Email.toLowerCase()) ?? []
    const concernAddress = (
        process.env.INBOUND_CONCERN_ADDRESS ?? ""
    ).toLowerCase()
    const adminAddress = (process.env.INBOUND_ADMIN_ADDRESS ?? "").toLowerCase()

    const isConcern =
        concernAddress &&
        (toAddresses.includes(concernAddress) ||
            payload.To.toLowerCase().includes(concernAddress))

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://bumpsetdrink.com"

    if (isConcern) {
        await db.insert(concerns).values({
            user_id: null,
            anonymous: false,
            contact_name: fromName,
            contact_email: fromEmail,
            contact_phone: null,
            want_followup: false,
            incident_date: new Date().toISOString().split("T")[0],
            location: "Submitted via email",
            person_involved: subject,
            description: bodyText || bodyHtml || "(No email body)",
            status: "new",
            source: "email",
            source_email_id: messageId
        })
        await notifyOmbudsmen(appUrl)
    } else {
        await db.insert(inboundEmails).values({
            email_id: messageId,
            from_address: fromEmail,
            from_name: fromName,
            to_address:
                toAddresses.find((a) => a === adminAddress) ||
                toAddresses[0] ||
                payload.To,
            subject,
            body_text: bodyText,
            body_html: bodyHtml,
            status: "new"
        })
        await notifyAdmins(appUrl, subject, from)
    }
}

// ---------------------------------------------------------------------------
// Subscription change handling
// ---------------------------------------------------------------------------

async function handleSubscriptionChange(
    payload: PostmarkSubscriptionChangePayload
) {
    const email = payload.Recipient?.toLowerCase()
    const streamId = payload.MessageStream
    if (!email || !streamId) return

    if (payload.SuppressSending) {
        // Upsert suppression record
        const existing = await db
            .select({ id: emailSuppressions.id })
            .from(emailSuppressions)
            .where(
                and(
                    eq(emailSuppressions.email, email),
                    eq(emailSuppressions.stream_id, streamId)
                )
            )
            .limit(1)

        if (existing.length === 0) {
            // Try to find user_id
            const [user] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.email, email))
                .limit(1)

            await db.insert(emailSuppressions).values({
                user_id: user?.id ?? null,
                email,
                stream_id: streamId,
                reason: payload.SuppressionReason ?? "ManualSuppression",
                origin: payload.Origin ?? "Recipient",
                suppressed_at: payload.Timestamp
                    ? new Date(payload.Timestamp)
                    : new Date()
            })
        }

        // Update users.unsubscribed for backward compatibility
        await db
            .update(users)
            .set({ unsubscribed: true })
            .where(eq(users.email, email))
    } else {
        // Remove suppression
        await db
            .delete(emailSuppressions)
            .where(
                and(
                    eq(emailSuppressions.email, email),
                    eq(emailSuppressions.stream_id, streamId)
                )
            )

        // Check if user has any remaining suppressions before clearing the flag
        const remainingSuppressions = await db
            .select({ id: emailSuppressions.id })
            .from(emailSuppressions)
            .where(eq(emailSuppressions.email, email))
            .limit(1)

        if (remainingSuppressions.length === 0) {
            await db
                .update(users)
                .set({ unsubscribed: false })
                .where(eq(users.email, email))
        }
    }

    console.log(
        `[postmark-webhook] Subscription change: ${email} stream=${streamId} suppressed=${payload.SuppressSending}`
    )
}

// ---------------------------------------------------------------------------
// Webhook token verification
// ---------------------------------------------------------------------------

function verifyWebhookToken(request: NextRequest): boolean {
    const token = process.env.POSTMARK_WEBHOOK_TOKEN
    if (!token) return true // No token configured = skip verification

    // Check Authorization header (Bearer or Basic)
    const authHeader = request.headers.get("authorization")
    if (authHeader) {
        // Support "Bearer <token>" or raw token
        const provided = authHeader.replace(/^Bearer\s+/i, "").trim()
        if (provided === token) return true
    }

    // Check query parameter fallback
    const url = new URL(request.url)
    const queryToken = url.searchParams.get("token")
    if (queryToken === token) return true

    return false
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    if (!verifyWebhookToken(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const payload = await request.json()

        // Postmark uses RecordType to distinguish webhook types
        if (payload.RecordType === "SubscriptionChange") {
            await handleSubscriptionChange(
                payload as PostmarkSubscriptionChangePayload
            )
            return NextResponse.json({ received: true })
        }

        // Inbound emails have no RecordType but have MessageID + From + To
        if (payload.MessageID && payload.From && !payload.RecordType) {
            await handleInboundEmail(payload as PostmarkInboundPayload)
            return NextResponse.json({ received: true })
        }

        // Other webhook types (bounces, opens, etc.) — acknowledge but ignore
        console.log(
            `[postmark-webhook] Unhandled RecordType: ${payload.RecordType ?? "unknown"}`
        )
        return NextResponse.json({ received: true })
    } catch (error) {
        console.error("[postmark-webhook] Error:", error)
        return NextResponse.json(
            { error: "Webhook processing failed" },
            { status: 400 }
        )
    }
}
