import "server-only"

// calendar-invalidation: handled by caller (read-only loader: nothing here
// writes; the @/lib/preseason imports are reads)
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { isAdminOrDirectorBySession } from "@/next/session"
import {
    EDIT_WEEK_2,
    getEditWeekData,
    type EditWeekData
} from "@/lib/preseason/edit-week-actions"

export const getEditWeek2Data = withAction(
    async (): Promise<
        ActionResult<Omit<EditWeekData, "status" | "message">>
    > => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }

        const { status, message, ...data } = await getEditWeekData(EDIT_WEEK_2)
        if (!status) {
            return fail(message ?? "Something went wrong while loading data.")
        }
        return ok(data)
    }
)
