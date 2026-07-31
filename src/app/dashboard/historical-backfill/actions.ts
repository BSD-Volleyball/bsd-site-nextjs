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
