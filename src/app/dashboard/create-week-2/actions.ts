"use server"

import type { ActionResult } from "@/next/action-helpers"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import { withAction, ok, fail } from "@/next/action-helpers"

import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"
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
            console.error("Error loading create week 2 data:", error)
            return fail("Something went wrong while loading data.")
        }
    }
)

export const saveWeek2Rosters = withAction(
    async (assignments: SavedAssignment[]): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        const userId = await getSessionUserId()
        if (!userId) {
            return fail("Not authenticated.")
        }

        const result = await savePreseasonWeekRosters(2, assignments, userId)
        if (result.status) {
            revalidateCalendarFeeds()
        }
        return result
    }
)
