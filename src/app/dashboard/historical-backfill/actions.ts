"use server"

import {
    type ActionResult,
    ok,
    requireAdmin,
    withAction
} from "@/next/action-helpers"
import { type MergeTarget, fetchMergeTargets } from "@/lib/legacy-accounts"

/**
 * Every real member account, for the "map to" picker. Fetched on demand rather
 * than shipped with the page: it is ~2,000 rows that most visits never open.
 */
export const getMergeTargets = withAction(
    async (): Promise<ActionResult<MergeTarget[]>> => {
        await requireAdmin()
        return ok(await fetchMergeTargets())
    }
)

// Merging a placeholder into a member is no longer done here. The panel picks
// the pair and hands off to /dashboard/merge-users, which composes the
// surviving record field by field and owns the merge itself -- one merge path,
// one confirmation, one audit entry.
