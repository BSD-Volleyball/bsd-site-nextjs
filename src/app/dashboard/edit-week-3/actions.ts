"use server"

import type { ActionResult } from "@/next/action-helpers"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import { withAction, ok, fail } from "@/next/action-helpers"

import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"
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

export const getEditWeek3Data = withAction(
    async (): Promise<
        ActionResult<Omit<EditWeekData, "status" | "message">>
    > => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }

        const { status, message, ...data } = await getEditWeekData(EDIT_WEEK_3)
        if (!status) {
            return fail(message ?? "Something went wrong while loading data.")
        }
        return ok(data)
    }
)

export const updateWeek3Rosters = withAction(
    async (slots: EditWeekRosterEntry[]): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        const userId = await getSessionUserId()
        if (!userId) {
            return fail("Not authenticated.")
        }

        const result = await updateEditWeekRosters(EDIT_WEEK_3, slots, userId)
        if (result.status) {
            revalidateCalendarFeeds()
        }
        return result
    }
)

export const sendWeek3RosterNotifications = withAction(
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
            EDIT_WEEK_3,
            assignments,
            removedUserIds,
            seasonLabel,
            userId
        )
    }
)
