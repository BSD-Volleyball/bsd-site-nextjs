"use server"

import type { ActionResult } from "@/next/action-helpers"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import { withAction, fail } from "@/next/action-helpers"
import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"
import { savePreseasonWeekRosters } from "@/lib/preseason/save-week-rosters"
import type { SavedAssignment } from "@/lib/preseason/types"

export const saveWeek3Rosters = withAction(
    async (assignments: SavedAssignment[]): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        const userId = await getSessionUserId()
        if (!userId) {
            return fail("Not authenticated.")
        }

        const result = await savePreseasonWeekRosters(3, assignments, userId)
        if (result.status) {
            revalidateCalendarFeeds()
        }
        return result
    }
)
