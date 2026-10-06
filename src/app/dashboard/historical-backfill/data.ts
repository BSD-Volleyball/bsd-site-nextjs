import "server-only"

import {
    type ActionResult,
    ok,
    requireAdmin,
    withAction
} from "@/next/action-helpers"
import {
    type HistoricalCoverage,
    fetchHistoricalCoverage
} from "@/lib/historical-coverage"
import { type LegacyAccount, fetchLegacyAccounts } from "@/lib/legacy-accounts"

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
