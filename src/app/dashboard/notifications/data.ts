import "server-only"

import type { ActionResult } from "@/next/action-helpers"
import { ok, requireSession, withAction } from "@/next/action-helpers"
import { getOptedOutTypes } from "@/lib/notifications/preferences"
import { getUserSuppressionState } from "@/lib/notifications/suppressions"
import type { NotificationType } from "@/lib/notifications/types"

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
