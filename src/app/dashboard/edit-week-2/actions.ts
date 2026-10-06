"use server"

import type { ActionResult } from "@/next/action-helpers"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import { withAction, fail } from "@/next/action-helpers"

import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"
import {
    EDIT_WEEK_2,
    sendEditWeekRosterNotifications,
    updateEditWeekRosters
} from "@/lib/preseason/edit-week-actions"
import type {
    EditWeekAssignment,
    EditWeekRosterEntry
} from "@/components/edit-week-roster/edit-week-roster-form"

export type {
    EditWeekPlayer as Week2EditablePlayer,
    EditWeekSlot as Week2EditableSlot,
    EditWeekRosterEntry as Week2RosterEntry
} from "@/components/edit-week-roster/edit-week-roster-form"

export const updateWeek2Rosters = withAction(
    async (slots: EditWeekRosterEntry[]): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        const userId = await getSessionUserId()
        if (!userId) {
            return fail("Not authenticated.")
        }

        const result = await updateEditWeekRosters(EDIT_WEEK_2, slots, userId)
        if (result.status) {
            revalidateCalendarFeeds()
        }
        return result
    }
)

export const sendWeek2RosterNotifications = withAction(
    async (
        assignments: EditWeekAssignment[],
        removedUserIds: string[],
        seasonLabel: string
    ): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        const userId = await getSessionUserId()
        if (!userId) {
            return fail("Not authenticated.")
        }

        return sendEditWeekRosterNotifications(
            EDIT_WEEK_2,
            assignments,
            removedUserIds,
            seasonLabel,
            userId
        )
    }
)
