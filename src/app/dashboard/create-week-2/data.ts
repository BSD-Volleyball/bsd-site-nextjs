import "server-only"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"

import { isAdminOrDirectorBySession } from "@/next/session"
import { loadPreseasonBaseData } from "@/lib/preseason/load-week-roster-data"
import { resolveAvailableSlots } from "@/lib/preseason/slots"
import { loadTryoutSlotRequests } from "@/lib/tryout-slot-requests"
import type {
    ExcludedPlayer,
    PreseasonDivision,
    Week2Candidate
} from "@/lib/preseason/types"
// Read-only: the @/lib/preseason imports above are loaders, nothing here
// writes. calendar-invalidation: handled by caller

interface CreateWeek2Data {
    seasonId: number
    seasonLabel: string
    divisions: PreseasonDivision[]
    candidates: Week2Candidate[]
    excludedPlayers: ExcludedPlayer[]
}

export const getCreateWeek2Data = withAction(
    async (): Promise<ActionResult<CreateWeek2Data>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }

        try {
            const result = await loadPreseasonBaseData({
                tryoutEventIndex: 1
            })

            if (!result.ok) {
                return fail(result.message)
            }

            const base = result.data
            const slotRequests = await loadTryoutSlotRequests(base.seasonId, 2)

            const candidates: Week2Candidate[] = base.candidates.map(
                (candidate) => {
                    const slotRequest = slotRequests.get(candidate.userId)
                    return {
                        ...candidate,
                        lastDivisionName:
                            base.draftsByUser.get(candidate.userId)?.[0]
                                ?.divisionName ?? null,
                        availableSlots: resolveAvailableSlots(
                            candidate,
                            slotRequest
                        ),
                        slotRequestComment: slotRequest?.comment ?? null
                    }
                }
            )

            return ok({
                seasonId: base.seasonId,
                seasonLabel: base.seasonLabel,
                divisions: base.divisions,
                candidates,
                excludedPlayers: base.excludedPlayers
            })
        } catch (error) {
            logger.error("Error loading create week 2 data", undefined, error)
            return fail("Something went wrong while loading data.")
        }
    }
)
