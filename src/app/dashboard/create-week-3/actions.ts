"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { withAction, fail } from "@/lib/action-helpers"
import { getIsAdminOrDirector } from "@/app/dashboard/access-actions"
import {
    loadConsecutiveTopDivSeasons,
    loadMovingDayInputs,
    loadPreseasonBaseData,
    loadWeek2DivisionByUser
} from "@/lib/preseason/load-week-roster-data"
import { savePreseasonWeekRosters } from "@/lib/preseason/save-week-rosters"
import { loadTryoutSlotRequests } from "@/lib/tryout-slot-requests"
import type {
    ExcludedPlayer,
    PreseasonDivision,
    SavedAssignment,
    Week3Candidate
} from "@/lib/preseason/types"

interface CreateWeek3Data {
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    divisions: PreseasonDivision[]
    candidates: Week3Candidate[]
    excludedPlayers: ExcludedPlayer[]
}

function emptyResult(message: string): CreateWeek3Data {
    return {
        status: false,
        message,
        seasonId: 0,
        seasonLabel: "",
        divisions: [],
        candidates: [],
        excludedPlayers: []
    }
}

export async function getCreateWeek3Data(): Promise<CreateWeek3Data> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return emptyResult("You don't have permission to access this page.")
    }

    try {
        const result = await loadPreseasonBaseData({
            tryoutEventIndex: 2,
            coachCaptainHandling: "preferRegular"
        })

        if (!result.ok) {
            return emptyResult(result.message)
        }

        const base = result.data
        const topDivisionId = base.divisions[0]?.id ?? null

        const [
            week2DivisionByUser,
            { forcedMoveByUser, recommendationCountByUser },
            consecutiveSeasonsInTopDivByUser,
            slotRequests
        ] = await Promise.all([
            loadWeek2DivisionByUser(base.seasonId),
            loadMovingDayInputs(base.seasonId),
            loadConsecutiveTopDivSeasons(
                base.seasonId,
                base.userIds,
                topDivisionId
            ),
            loadTryoutSlotRequests(base.seasonId, 3)
        ])

        const candidates: Week3Candidate[] = base.candidates.map(
            (candidate) => {
                const recommendations = recommendationCountByUser.get(
                    candidate.userId
                ) || { up: 0, down: 0 }
                const slotRequest = slotRequests.get(candidate.userId)

                return {
                    ...candidate,
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
                    availableSlots: slotRequest?.availableSlots ?? null,
                    slotRequestComment: slotRequest?.comment ?? null
                }
            }
        )

        return {
            status: true,
            seasonId: base.seasonId,
            seasonLabel: base.seasonLabel,
            divisions: base.divisions,
            candidates,
            excludedPlayers: base.excludedPlayers
        }
    } catch (error) {
        console.error("Error loading create week 3 data:", error)
        return emptyResult("Something went wrong while loading data.")
    }
}

export const saveWeek3Rosters = withAction(
    async (assignments: SavedAssignment[]): Promise<ActionResult> => {
        const hasAccess = await getIsAdminOrDirector()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        return savePreseasonWeekRosters(3, assignments)
    }
)
