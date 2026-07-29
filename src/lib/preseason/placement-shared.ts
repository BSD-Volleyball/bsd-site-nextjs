// Division-placement plumbing shared by the cascade (week 2) and continuity
// (week 3) strategies: bucket construction, a tracker that records where each
// unit sits plus per-player placement reasons/locks, and the reason metadata
// used by the roster-builder UI.

import { addUnitToPlacement, removeUnitFromPlacement } from "./units"
import { getDivisionTargets } from "./allocation"
import type {
    DivisionPlacement,
    PlacementReason,
    PlacementUnit,
    PreseasonCandidate,
    PreseasonDivision
} from "./types"

export const placementReasonLabel: Record<PlacementReason, string> = {
    captain_locked: "Captain (locked)",
    mutual_pair_locked: "Paired with captain (locked)",
    score_cascade: "Placed by score",
    tryout2_same_division: "Played in Week 2 division",
    forced_move_up: "Forced move up",
    forced_move_down: "Forced move down",
    score_based: "Did not play week 2"
}

export const placementReasonClasses: Record<PlacementReason, string> = {
    captain_locked:
        "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100",
    mutual_pair_locked:
        "border-orange-300 bg-orange-100 text-orange-950 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-100",
    score_cascade:
        "border-slate-300 bg-slate-100 text-slate-950 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-100",
    tryout2_same_division:
        "border-blue-300 bg-blue-100 text-blue-950 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-100",
    forced_move_up:
        "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100",
    forced_move_down:
        "border-rose-300 bg-rose-100 text-rose-950 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-100",
    score_based:
        "border-slate-300 bg-slate-100 text-slate-950 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-100"
}

/** Legend/grouping order for the week-3 (continuity) reason set. */
export const placementReasonOrder: PlacementReason[] = [
    "captain_locked",
    "mutual_pair_locked",
    "tryout2_same_division",
    "forced_move_up",
    "forced_move_down",
    "score_based"
]

export function initDivisionBuckets<C extends PreseasonCandidate>(
    divisions: PreseasonDivision[],
    candidates: C[]
): Map<number, DivisionPlacement<C>> {
    const targets = getDivisionTargets(divisions, candidates)
    return new Map<number, DivisionPlacement<C>>(
        divisions.map((division) => [
            division.id,
            {
                division,
                units: [],
                maleCount: 0,
                nonMaleCount: 0,
                size: 0,
                targetSize: targets.get(division.id)?.size || 0,
                targetMale: targets.get(division.id)?.male || 0,
                targetNonMale: targets.get(division.id)?.nonMale || 0
            }
        ])
    )
}

export interface PlacementTracker<C extends PreseasonCandidate> {
    placeUnit(
        unit: PlacementUnit<C>,
        divisionId: number,
        reason: PlacementReason,
        locked: boolean
    ): void
    moveUnitToDivision(unit: PlacementUnit<C>, targetDivisionId: number): void
    getUnitDivisionId(unitId: string): number | undefined
    setReason(userId: string, reason: PlacementReason): void
    readonly reasonByUser: Map<string, PlacementReason>
    readonly lockedUserIds: Set<string>
}

export function createPlacementTracker<C extends PreseasonCandidate>(
    placement: Map<number, DivisionPlacement<C>>
): PlacementTracker<C> {
    const reasonByUser = new Map<string, PlacementReason>()
    const lockedUserIds = new Set<string>()
    const unitDivisionMap = new Map<string, number>()

    return {
        placeUnit(unit, divisionId, reason, locked) {
            const target = placement.get(divisionId)
            if (!target) {
                return
            }

            addUnitToPlacement(target, unit)
            unitDivisionMap.set(unit.id, divisionId)

            for (const player of unit.players) {
                reasonByUser.set(player.userId, reason)
                if (locked) {
                    lockedUserIds.add(player.userId)
                }
            }
        },
        moveUnitToDivision(unit, targetDivisionId) {
            const currentDivisionId = unitDivisionMap.get(unit.id)
            if (!currentDivisionId || currentDivisionId === targetDivisionId) {
                return
            }

            const currentBucket = placement.get(currentDivisionId)
            const targetBucket = placement.get(targetDivisionId)

            if (!currentBucket || !targetBucket) {
                return
            }

            removeUnitFromPlacement(currentBucket, unit)
            addUnitToPlacement(targetBucket, unit)
            unitDivisionMap.set(unit.id, targetDivisionId)
        },
        getUnitDivisionId(unitId) {
            return unitDivisionMap.get(unitId)
        },
        setReason(userId, reason) {
            reasonByUser.set(userId, reason)
        },
        reasonByUser,
        lockedUserIds
    }
}
