"use server"

import {
    getDraftBoardDivisions,
    getDraftResultsForDivision,
    type DraftTeam
} from "@/lib/draft-results"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requireSeasonConfig,
    requirePositiveInt
} from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"

/**
 * One division's draft results for the current season. The caller must be
 * an admin, or captain/coach/commissioner of that division this season.
 */
export const getDraftBoard = withAction(
    async (divisionId: number): Promise<ActionResult<DraftTeam[]>> => {
        const session = await requireSession()
        requirePositiveInt(divisionId, "division")
        const config = await requireSeasonConfig()

        const allowed = await getDraftBoardDivisions(
            session.user.id,
            config.seasonId
        )
        if (!allowed.some((d) => d.id === divisionId)) {
            return fail("Unauthorized.")
        }

        return ok(await getDraftResultsForDivision(config.seasonId, divisionId))
    }
)
