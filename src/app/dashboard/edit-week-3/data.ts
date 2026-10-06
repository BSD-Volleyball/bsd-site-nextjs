import "server-only"

import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"

import { isAdminOrDirectorBySession } from "@/next/session"
import {
    EDIT_WEEK_3,
    getEditWeekData,
    type EditWeekData
} from "@/lib/preseason/edit-week-actions"
// calendar-invalidation: handled by caller
// (Read-only: this loader imports from @/lib/preseason but writes nothing;
// the edit-week-3 actions that write call revalidateCalendarFeeds.)

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
