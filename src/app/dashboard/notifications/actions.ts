"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { fail, ok, requireSession, withAction } from "@/lib/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import {
    reactivateStreamSuppression,
    syncCategoryOptouts
} from "@/lib/notifications/postmark-sync"
import {
    getOptedOutTypes,
    setUserOptouts
} from "@/lib/notifications/preferences"
import { getUserSuppressionState } from "@/lib/notifications/suppressions"
import {
    CATEGORY_STREAM_SYNC,
    NOTIFICATION_TYPES,
    STREAM_LABELS,
    type NotificationCategoryId,
    type NotificationType,
    isNotificationType,
    typesInCategory
} from "@/lib/notifications/types"
import type { MessageStream } from "@/lib/postmark"

export interface NotificationSettings {
    optedOut: NotificationType[]
    suppressions: Array<{
        streamId: string
        reason: string
        origin: string
        suppressedAt: Date
        canReactivate: boolean
    }>
}

export const getNotificationSettings = withAction(
    async (): Promise<ActionResult<NotificationSettings>> => {
        const session = await requireSession()
        const [optedOut, suppressions] = await Promise.all([
            getOptedOutTypes(session.user.id),
            getUserSuppressionState(session.user.email)
        ])
        return ok({ optedOut: [...optedOut], suppressions })
    }
)

export const saveNotificationPreferences = withAction(
    async (optedOut: string[]): Promise<ActionResult> => {
        const session = await requireSession()

        const types: NotificationType[] = []
        for (const value of optedOut) {
            if (!isNotificationType(value)) {
                return fail("Unknown notification type.")
            }
            if (NOTIFICATION_TYPES[value].mandatory) {
                return fail("That notification can't be turned off.")
            }
            types.push(value)
        }

        const before = await getOptedOutTypes(session.user.id)
        const { added, removed } = await setUserOptouts(session.user.id, types)
        if (added.length > 0 || removed.length > 0) {
            await syncCategoryOptouts({
                userId: session.user.id,
                email: session.user.email,
                before,
                after: new Set(types),
                origin: "Customer"
            })
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "notification_optouts",
                entityId: session.user.id,
                summary: `Updated notification preferences (opted out: ${added.join(", ") || "none"}; opted back in: ${removed.join(", ") || "none"})`
            })
        }

        return ok(undefined, "Notification preferences saved!")
    }
)

export const reactivateStream = withAction(
    async (streamId: string): Promise<ActionResult> => {
        const session = await requireSession()
        if (!(streamId in STREAM_LABELS)) {
            return fail("Unknown email stream.")
        }

        const suppressions = await getUserSuppressionState(session.user.email)
        const suppression = suppressions.find((s) => s.streamId === streamId)
        if (!suppression) {
            return fail("No suppression found for that stream.")
        }
        if (!suppression.canReactivate) {
            return fail(
                "This block was created by a spam complaint and can't be undone automatically. Contact info@bumpsetdrink.com for help."
            )
        }

        try {
            await reactivateStreamSuppression(
                session.user.email,
                streamId as MessageStream
            )
        } catch {
            return fail(
                "Couldn't re-enable emails right now. Please try again in a few minutes."
            )
        }

        // Keep preferences consistent: a stream that maps to a category must
        // not stay fully opted out after the user explicitly resumed it.
        const mappedCategory = (
            Object.entries(CATEGORY_STREAM_SYNC) as [
                NotificationCategoryId,
                MessageStream
            ][]
        ).find(([, stream]) => stream === streamId)?.[0]
        if (mappedCategory) {
            const current = await getOptedOutTypes(session.user.id)
            const categoryTypes = typesInCategory(mappedCategory)
            if (categoryTypes.every((t) => current.has(t))) {
                for (const t of categoryTypes) current.delete(t)
                await setUserOptouts(session.user.id, [...current])
            }
        }

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "email_suppressions",
            entityId: session.user.id,
            summary: `Resumed ${STREAM_LABELS[streamId]} emails (removed ${suppression.reason} suppression on ${streamId})`
        })

        return ok(undefined, "You'll receive these emails again.")
    }
)
