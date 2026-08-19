"use server"

import {
    type ActionResult,
    ok,
    requireSession,
    withAction
} from "@/lib/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import { type CalendarLinks, buildCalendarLinks } from "@/lib/calendar-links"
import {
    getOrCreateCalendarToken,
    rotateCalendarToken
} from "@/lib/calendar-token"

/** Subscription URLs for the signed-in user, minting a token on first use. */
export const getCalendarLinks = withAction(
    async (): Promise<ActionResult<CalendarLinks>> => {
        const session = await requireSession()
        const token = await getOrCreateCalendarToken(session.user.id)
        return ok(buildCalendarLinks(token))
    }
)

/** Rotates the user's token so previously shared feed URLs stop working. */
export const resetCalendarToken = withAction(
    async (): Promise<ActionResult<CalendarLinks>> => {
        const session = await requireSession()
        const token = await rotateCalendarToken(session.user.id)
        await logAuditEntry({
            userId: session.user.id,
            action: "reset_calendar_token",
            entityType: "calendar_tokens",
            entityId: session.user.id,
            summary: "Reset calendar subscription links"
        })
        return ok(
            buildCalendarLinks(token),
            "Calendar links reset. Old links no longer work."
        )
    }
)
