"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { withAction, fail } from "@/lib/action-helpers"
import { getIsAdminOrDirector } from "@/app/dashboard/access-actions"
import { loadPreseasonBaseData } from "@/lib/preseason/load-week-roster-data"
import { savePreseasonWeekRosters } from "@/lib/preseason/save-week-rosters"
import { resolveAvailableSlots } from "@/lib/preseason/slots"
import { loadTryoutSlotRequests } from "@/lib/tryout-slot-requests"
import type {
    ExcludedPlayer,
    PreseasonDivision,
    SavedAssignment,
    Week2Candidate
} from "@/lib/preseason/types"

interface CreateWeek2Data {
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    divisions: PreseasonDivision[]
    candidates: Week2Candidate[]
    excludedPlayers: ExcludedPlayer[]
}

function emptyResult(message: string): CreateWeek2Data {
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

export async function getCreateWeek2Data(): Promise<CreateWeek2Data> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return emptyResult("You don't have permission to access this page.")
    }

    try {
        const result = await loadPreseasonBaseData({
            tryoutEventIndex: 1
        })

        if (!result.ok) {
            return emptyResult(result.message)
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

        return {
            status: true,
            seasonId: base.seasonId,
            seasonLabel: base.seasonLabel,
            divisions: base.divisions,
            candidates,
            excludedPlayers: base.excludedPlayers
        }
    } catch (error) {
        console.error("Error loading create week 2 data:", error)
        return emptyResult("Something went wrong while loading data.")
    }
}

export const saveWeek2Rosters = withAction(
    async (assignments: SavedAssignment[]): Promise<ActionResult> => {
        const hasAccess = await getIsAdminOrDirector()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        return savePreseasonWeekRosters(2, assignments)
    }
)
