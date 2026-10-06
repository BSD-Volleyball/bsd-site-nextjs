import "server-only"

// calendar-invalidation: handled by caller (read-only loader: nothing here
// writes; the @/lib/preseason imports are reads)
import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { isAdminOrDirectorBySession } from "@/next/session"
import {
    loadConsecutiveTopDivSeasons,
    loadDraftNightLeavers,
    loadMovingDayInputs,
    loadPreseasonBaseData,
    loadWeek2DivisionByUser
} from "@/lib/preseason/load-week-roster-data"
import { resolveAvailableSlots } from "@/lib/preseason/slots"
import { DRAFT_NIGHT_SLOT } from "@/lib/preseason/config"
import { loadTryoutSlotRequests } from "@/lib/tryout-slot-requests"
import type {
    ExcludedPlayer,
    PreseasonDivision,
    Week3Candidate
} from "@/lib/preseason/types"

interface CreateWeek3Data {
    seasonId: number
    seasonLabel: string
    divisions: PreseasonDivision[]
    candidates: Week3Candidate[]
    excludedPlayers: ExcludedPlayer[]
}

export const getCreateWeek3Data = withAction(
    async (): Promise<ActionResult<CreateWeek3Data>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }

        try {
            const result = await loadPreseasonBaseData({
                tryoutEventIndex: 2
            })

            if (!result.ok) {
                return fail(result.message)
            }

            const base = result.data
            const topDivisionId = base.divisions[0]?.id ?? null

            const [
                week2DivisionByUser,
                { forcedMoveByUser, recommendationCountByUser },
                consecutiveSeasonsInTopDivByUser,
                slotRequests,
                draftNightLeavers
            ] = await Promise.all([
                loadWeek2DivisionByUser(base.seasonId),
                loadMovingDayInputs(base.seasonId),
                loadConsecutiveTopDivSeasons(
                    base.seasonId,
                    base.userIds,
                    topDivisionId
                ),
                loadTryoutSlotRequests(base.seasonId, 3),
                loadDraftNightLeavers(base.seasonId, topDivisionId)
            ])
            const draftLeaverComment = `Leaves after slot ${DRAFT_NIGHT_SLOT} for the ${base.divisions[0]?.name ?? "top division"} draft`

            const candidates: Week3Candidate[] = base.candidates.map(
                (candidate) => {
                    const recommendations = recommendationCountByUser.get(
                        candidate.userId
                    ) || { up: 0, down: 0 }
                    const slotRequest = slotRequests.get(candidate.userId)
                    const leavesForDraft = draftNightLeavers.has(
                        candidate.userId
                    )
                    const withDraft = { ...candidate, leavesForDraft }

                    return {
                        ...withDraft,
                        week2DivisionId:
                            week2DivisionByUser.get(candidate.userId) || null,
                        forcedMoveDirection:
                            forcedMoveByUser.get(candidate.userId) || null,
                        consecutiveSeasonsInTopDiv:
                            consecutiveSeasonsInTopDivByUser.get(
                                candidate.userId
                            ) ?? 0,
                        recommendationUpCount: recommendations.up,
                        recommendationDownCount: recommendations.down,
                        availableSlots: resolveAvailableSlots(
                            withDraft,
                            slotRequest
                        ),
                        slotRequestComment: leavesForDraft
                            ? [draftLeaverComment, slotRequest?.comment]
                                  .filter(Boolean)
                                  .join(" — ")
                            : (slotRequest?.comment ?? null)
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
            logger.error("Error loading create week 3 data", undefined, error)
            return fail("Something went wrong while loading data.")
        }
    }
)
