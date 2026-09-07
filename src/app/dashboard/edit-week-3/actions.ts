"use server"

import type { ActionResult } from "@/next/action-helpers"
import { withAction, fail } from "@/next/action-helpers"
import { getIsAdminOrDirector } from "@/app/dashboard/access-actions"
import { getSessionUserId } from "@/next/session"
import {
    EDIT_WEEK_3,
    getEditWeekData,
    sendEditWeekRosterNotifications,
    updateEditWeekRosters,
    type EditWeekData
} from "@/lib/preseason/edit-week-actions"
import type {
    EditWeekAssignment,
    EditWeekRosterEntry
} from "@/components/edit-week-roster/edit-week-roster-form"

export type {
    EditWeekPlayer as Week3EditablePlayer,
    EditWeekSlot as Week3EditableSlot,
    EditWeekRosterEntry as Week3RosterEntry
} from "@/components/edit-week-roster/edit-week-roster-form"

export async function getEditWeek3Data(): Promise<EditWeekData> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            seasonId: 0,
            seasonLabel: "",
            players: [],
            slots: [],
            slotLabels: []
        }
    }

    return getEditWeekData(EDIT_WEEK_3)
}

export const updateWeek3Rosters = withAction(
    async (slots: EditWeekRosterEntry[]): Promise<ActionResult> => {
        const hasAccess = await getIsAdminOrDirector()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        const userId = await getSessionUserId()
        if (!userId) {
            return fail("Not authenticated.")
        }

        return updateEditWeekRosters(EDIT_WEEK_3, slots, userId)
    }
)

export const sendWeek3RosterNotifications = withAction(
    async (
        assignments: EditWeekAssignment[],
        removedUserIds: string[],
        seasonLabel: string
    ): Promise<ActionResult> => {
        const hasAccess = await getIsAdminOrDirector()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        const userId = await getSessionUserId()
        if (!userId) {
            return fail("Not authenticated.")
        }

        return sendEditWeekRosterNotifications(
            EDIT_WEEK_3,
            assignments,
            removedUserIds,
            seasonLabel,
            userId
        )
    }
)
