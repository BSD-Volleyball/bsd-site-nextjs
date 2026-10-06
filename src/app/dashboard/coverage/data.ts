import "server-only"

import { listPresencePool, loadCoverage } from "@/lib/coverage/load"
import type { CoverageAdmin, CoverageDate } from "@/lib/coverage/types"
import { getLeagueDateString } from "@/lib/date-utils"
import {
    type ActionResult,
    ok,
    requireAdmin,
    withAction
} from "@/next/action-helpers"

export interface CoverageView {
    dates: CoverageDate[]
    pool: CoverageAdmin[]
    today: string
}

export const getCoverageView = withAction(
    async (): Promise<ActionResult<CoverageView>> => {
        await requireAdmin()
        const today = getLeagueDateString()
        const [dates, pool] = await Promise.all([
            loadCoverage({ fromDate: today }),
            listPresencePool()
        ])
        return ok({ dates, pool, today })
    }
)
