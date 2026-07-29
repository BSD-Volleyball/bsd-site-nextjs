"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { withAction, fail } from "@/lib/action-helpers"
import { getIsAdminOrDirector } from "@/app/dashboard/access-actions"
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
            slots: []
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

        return updateEditWeekRosters(EDIT_WEEK_3, slots)
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

        return sendEditWeekRosterNotifications(
            EDIT_WEEK_3,
            assignments,
            removedUserIds,
            seasonLabel
        )
    }
)
