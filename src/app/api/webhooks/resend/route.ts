import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { Resend } from "resend"
import { db } from "@/database/db"
import { concerns, inboundEmails, users, userRoles } from "@/database/schema"
import { eq } from "drizzle-orm"
import { site } from "@/config/site"

const resend = new Resend(process.env.RESEND_API_KEY)

function parseFromAddress(from: string): {
    name: string | null
    email: string
} {
    // "Display Name <email@example.com>" or just "email@example.com"
    const match = from.match(/^(.+?)\s*<(.+?)>$/)
    if (match) {
        return {
            name: match[1].trim().replace(/^"|"$/g, ""),
            email: match[2].trim()
        }
    }
    return { name: null, email: from.trim() }
}

function headerValue(
    headers: Record<string, string> | null | undefined,
    name: string,
    fallback: string
): string {
    if (!headers) return fallback
    const key = Object.keys(headers).find(
        (k) => k.toLowerCase() === name.toLowerCase()
    )
    return key && headers[key] ? headers[key] : fallback
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
        await resend.batch.send(
            emails.map((to) => ({
                from: site.mailFrom,
                to,
                subject: "New Concern Submitted via Email",
                html: `<p>A new concern has been submitted via email.</p><p><a href="${appUrl}/dashboard/manage-concerns">View concerns</a></p>`
            }))
        )
    }
}

async function notifyAdmins(appUrl: string, subject: string) {
    const adminRows = await db
        .select({ email: users.email })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.user_id, users.id))
        .where(eq(userRoles.role, "admin"))

    const emails = [...new Set(adminRows.map((r) => r.email).filter(Boolean))]

    if (emails.length > 0) {
        await resend.batch.send(
            emails.map((to) => ({
                from: site.mailFrom,
                to,
                subject: "New Inbound Email Received",
                html: `<p>A new email has been received.</p><p><strong>Subject:</strong> ${subject}</p><p><a href="${appUrl}/dashboard/manage-emails">View emails</a></p>`
            }))
        )
    }
}

async function handleConcernEmail(
    emailId: string,
    from: string,
    subject: string,
    bodyText: string | null,
    bodyHtml: string | null
) {
    const parsed = parseFromAddress(from)

    const description = bodyText || bodyHtml || "(No email body)"

    await db.insert(concerns).values({
        user_id: null,
        anonymous: false,
        contact_name: parsed.name,
        contact_email: parsed.email,
        contact_phone: null,
        want_followup: false,
        incident_date: new Date().toISOString().split("T")[0],
        location: "Submitted via email",
        person_involved: subject || "(No subject)",
        description,
        status: "new",
        source: "email",
        source_email_id: emailId
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://bumpsetdrink.com"
    await notifyOmbudsmen(appUrl)
}

async function handleAdminEmail(
    emailId: string,
    from: string,
    toAddress: string,
    subject: string,
    bodyText: string | null,
    bodyHtml: string | null
) {
    const parsed = parseFromAddress(from)

    await db.insert(inboundEmails).values({
        email_id: emailId,
        from_address: parsed.email,
        from_name: parsed.name,
        to_address: toAddress,
        subject: subject || "(No subject)",
        body_text: bodyText,
        body_html: bodyHtml,
        status: "new"
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://bumpsetdrink.com"
    await notifyAdmins(appUrl, subject || "(No subject)")
}

export async function POST(request: NextRequest) {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
    if (!webhookSecret) {
        console.error("RESEND_WEBHOOK_SECRET is not configured")
        return NextResponse.json(
            { error: "Webhook not configured" },
            { status: 500 }
        )
    }

    try {
        const payload = await request.text()

        const event = resend.webhooks.verify({
            payload,
            headers: {
                id: request.headers.get("svix-id") ?? "",
                timestamp: request.headers.get("svix-timestamp") ?? "",
                signature: request.headers.get("svix-signature") ?? ""
            },
            webhookSecret
        })

        if (event.type !== "email.received") {
            return NextResponse.json({ received: true })
        }

        const { data } = event
        const emailId = data.email_id

        // Fetch full email content — log both data and error for diagnostics
        const emailResponse = await resend.emails.receiving.get(emailId)
        if (emailResponse.error) {
            console.error(
                "[resend-webhook] receiving.get error:",
                JSON.stringify(emailResponse.error)
            )
        }
        const fullEmail = emailResponse.data
        console.log(
            "[resend-webhook] receiving.get result:",
            JSON.stringify({
                emailId,
                hasData: !!fullEmail,
                textLen: fullEmail?.text?.length ?? null,
                htmlLen: fullEmail?.html?.length ?? null,
                error: emailResponse.error ?? null
            })
        )

        const bodyText = fullEmail?.text ?? null
        const bodyHtml = fullEmail?.html ?? null
        const subject = data.subject ?? ""
        // The top-level `from` field often carries only the bare address.
        // The original RFC 5322 From header preserves the full display name,
        // so prefer it and fall back through the API field then the webhook event.
        const from = headerValue(
            fullEmail?.headers,
            "from",
            fullEmail?.from ?? data.from ?? ""
        )
        // The webhook `to` array reflects the forwarded delivery path, not the
        // original recipient. Pull the To header from the raw headers instead.
        const originalTo = headerValue(
            fullEmail?.headers,
            "to",
            data.to?.[0] ?? ""
        )
        const toAddresses = data.to ?? []

        // Route based on to-address — check both the original header and the
        // forwarded delivery addresses to catch the concern address either way.
        const concernAddress = process.env.INBOUND_CONCERN_ADDRESS ?? ""
        const isConcern =
            concernAddress &&
            (originalTo.toLowerCase().includes(concernAddress.toLowerCase()) ||
                toAddresses.some(
                    (addr: string) =>
                        addr.toLowerCase() === concernAddress.toLowerCase()
                ))

        if (isConcern) {
            await handleConcernEmail(emailId, from, subject, bodyText, bodyHtml)
        } else {
            await handleAdminEmail(
                emailId,
                from,
                originalTo || toAddresses[0] || "",
                subject,
                bodyText,
                bodyHtml
            )
        }

        return NextResponse.json({ received: true })
    } catch (error) {
        console.error("Webhook error:", error)
        return NextResponse.json(
            { error: "Webhook processing failed" },
            { status: 400 }
        )
    }
}
