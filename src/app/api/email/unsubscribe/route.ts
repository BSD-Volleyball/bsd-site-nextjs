/**
 * RFC 8058 one-click unsubscribe endpoint.
 *
 * Every preference-controlled notification email carries
 *   List-Unsubscribe: <https://…/api/email/unsubscribe?token=…>
 *   List-Unsubscribe-Post: List-Unsubscribe=One-Click
 * headers. Mail providers POST to the URL server-to-server with no cookies,
 * so the signed token is the entire authorization: it opts exactly one user
 * out of exactly one notification type.
 *
 * GET (a human clicking the raw link) only shows a confirmation page whose
 * button POSTs back here. It must not change anything itself: mail security
 * scanners fetch every link in an incoming message, which used to
 * unsubscribe people who never clicked.
 */

import { eq } from "drizzle-orm"
import { type NextRequest, NextResponse } from "next/server"
import { site } from "@/config/site"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { logAuditEntry } from "@/lib/audit-log"
import { escapeHtml } from "@/lib/email-html"
import { logger } from "@/lib/logger"
import { syncCategoryOptouts } from "@/lib/notifications/postmark-sync"
import { addOptout, getOptedOutTypes } from "@/lib/notifications/preferences"
import {
    NOTIFICATION_TYPES,
    type NotificationType
} from "@/lib/notifications/types"
import { verifyUnsubscribeToken } from "@/lib/notifications/unsubscribe-token"

async function applyOptout(
    userId: string,
    type: NotificationType
): Promise<boolean> {
    if (NOTIFICATION_TYPES[type].mandatory) return false

    const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    if (!user) return false

    const before = await getOptedOutTypes(user.id)
    const added = await addOptout(user.id, type)
    if (added) {
        const after = new Set(before)
        after.add(type)
        await syncCategoryOptouts({
            userId: user.id,
            email: user.email,
            before,
            after,
            origin: "Customer"
        })
        // The dashboard logs the same change; without this an opt-out is
        // attributable when made in the UI and invisible when made from an
        // email client's one-click link.
        await logAuditEntry({
            userId: user.id,
            action: "update_notification_preferences",
            entityType: "notification_optouts",
            entityId: user.id,
            summary: `Opted out of "${type}" via one-click unsubscribe`
        })
        logger.info("[unsubscribe] One-click opt-out applied", {
            userId: user.id,
            type
        })
    }
    return true
}

function tokenFrom(request: NextRequest): string | null {
    return request.nextUrl.searchParams.get("token")
}

/** Set by the GET confirmation page's form, never by a mail provider. */
const CONFIRM_FIELD = "confirmed"

async function isConfirmationForm(request: NextRequest): Promise<boolean> {
    const type = request.headers.get("content-type") ?? ""
    if (!type.includes("application/x-www-form-urlencoded")) return false
    try {
        const form = await request.formData()
        return form.get(CONFIRM_FIELD) === "1"
    } catch {
        return false
    }
}

export async function POST(request: NextRequest) {
    const token = tokenFrom(request)
    const verified = token ? verifyUnsubscribeToken(token) : null
    const fromPage = await isConfirmationForm(request)
    if (!verified) {
        if (fromPage) {
            return NextResponse.redirect(
                new URL("/dashboard/notifications", site.publicUrl),
                303
            )
        }
        return NextResponse.json({ error: "Invalid token" }, { status: 400 })
    }

    const applied = await applyOptout(verified.userId, verified.type)
    if (fromPage) {
        // The Notifications page shows the resulting state (and offers
        // re-enable).
        return NextResponse.redirect(
            new URL("/dashboard/notifications", site.publicUrl),
            303
        )
    }
    if (!applied) {
        return NextResponse.json(
            { error: "Cannot unsubscribe from this notification" },
            { status: 400 }
        )
    }
    return NextResponse.json({ status: "unsubscribed" })
}

export async function GET(request: NextRequest) {
    const token = tokenFrom(request)
    const verified = token ? verifyUnsubscribeToken(token) : null
    if (!verified || NOTIFICATION_TYPES[verified.type].mandatory) {
        // An invalid or mandatory-type token still lands somewhere sensible.
        return NextResponse.redirect(
            new URL("/dashboard/notifications", site.publicUrl)
        )
    }

    const label = escapeHtml(NOTIFICATION_TYPES[verified.type].label)
    const action = escapeHtml(
        `/api/email/unsubscribe?token=${encodeURIComponent(token ?? "")}`
    )
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Unsubscribe – ${escapeHtml(site.name)}</title>
<style>
body{font-family:system-ui,sans-serif;background:#f9fafb;color:#111827;margin:0;padding:48px 16px}
main{max-width:420px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px}
h1{font-size:20px;margin:0 0 12px}
p{line-height:1.5;margin:0 0 20px}
button{background:#2563eb;color:#fff;border:0;border-radius:6px;padding:10px 18px;font-size:15px;cursor:pointer}
</style>
</head>
<body>
<main>
<h1>Unsubscribe?</h1>
<p>Stop receiving <strong>${label}</strong> emails from ${escapeHtml(site.name)}. You can turn them back on from your Notifications page.</p>
<form method="post" action="${action}">
<input type="hidden" name="${CONFIRM_FIELD}" value="1">
<button type="submit">Unsubscribe</button>
</form>
</main>
</body>
</html>`
    return new NextResponse(html, {
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "private, no-store"
        }
    })
}
