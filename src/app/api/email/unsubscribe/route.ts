/**
 * RFC 8058 one-click unsubscribe endpoint.
 *
 * Every preference-controlled notification email carries
 *   List-Unsubscribe: <https://…/api/email/unsubscribe?token=…>
 *   List-Unsubscribe-Post: List-Unsubscribe=One-Click
 * headers. Mail providers POST to the URL server-to-server with no cookies,
 * so the signed token is the entire authorization: it opts exactly one user
 * out of exactly one notification type. GET handles a human clicking the raw
 * link and lands them on the Notifications page after applying the same
 * opt-out.
 */

import { eq } from "drizzle-orm"
import { type NextRequest, NextResponse } from "next/server"
import { site } from "@/config/site"
import { db } from "@/database/db"
import { users } from "@/database/schema"
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

export async function POST(request: NextRequest) {
    const token = tokenFrom(request)
    const verified = token ? verifyUnsubscribeToken(token) : null
    if (!verified) {
        return NextResponse.json({ error: "Invalid token" }, { status: 400 })
    }

    const applied = await applyOptout(verified.userId, verified.type)
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
    if (verified) {
        await applyOptout(verified.userId, verified.type)
    }
    // The Notifications page shows the resulting state (and offers re-enable);
    // an invalid token still lands somewhere sensible.
    return NextResponse.redirect(
        new URL("/dashboard/notifications", site.publicUrl)
    )
}
