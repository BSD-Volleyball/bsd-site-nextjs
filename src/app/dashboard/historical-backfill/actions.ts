"use server"

import {
    type ActionResult,
    ok,
    requireAdmin,
    withAction
} from "@/lib/action-helpers"
import {
    type HistoricalCoverage,
    fetchHistoricalCoverage
} from "@/lib/historical-coverage"
import {
    type LegacyAccount,
    type MergeTarget,
    fetchLegacyAccounts,
    fetchMergeTargets
} from "@/lib/legacy-accounts"

/**
 * Live coverage of the historical backfill. Read-only, but admin-gated like
 * every other exported action: it exposes the full season roster/match census.
 */
export const getHistoricalCoverage = withAction(
    async (): Promise<ActionResult<HistoricalCoverage>> => {
        await requireAdmin()
        return ok(await fetchHistoricalCoverage())
    }
)

/**
 * The `legacy-*` placeholder accounts the archive backfill minted for players
 * it could not bind to a real member, each with a suggested match.
 */
export const getLegacyAccounts = withAction(
    async (): Promise<ActionResult<LegacyAccount[]>> => {
        await requireAdmin()
        return ok(await fetchLegacyAccounts())
    }
)

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
