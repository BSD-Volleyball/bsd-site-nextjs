// Week-3 placement logic: continuity-driven division placement (week-2
// carry-forward, forced moves). Shared primitives (units, allocation) and
// the team engine live in src/lib/preseason; week 3 binds the team engine
// with its rule set (no new-player constraint, top-division back court).

import {
    addUnitToPlacement,
    buildPlacementUnits,
    compareCandidates,
    removeUnitFromPlacement
} from "@/lib/preseason/units"
import {
    getDivisionTargets,
    getScoreBandLevel
} from "@/lib/preseason/allocation"
import {
    buildTeamsForDivision as buildTeamsForDivisionWithOptions,
    type TeamBucket
} from "@/lib/preseason/teams"
import type {
    DivisionPlacement as PreseasonDivisionPlacement,
    PlacedPlayer,
    PlacementReason,
    PlacementUnit as PreseasonPlacementUnit,
    Week3Candidate
} from "@/lib/preseason/types"
import type { Week3Division } from "./week3-types"

export {
    addUnitToPlacement,
    buildPlacementUnits,
    compareCandidates,
    getDisplayName,
    removeUnitFromPlacement,
    sortDivisionPlayers,
    toOriginalPlacedPlayer
} from "@/lib/preseason/units"
export {
    allocateByWeightWithCapacity,
    getDivisionTargets,
    getSnakeOrder
} from "@/lib/preseason/allocation"
export { buildTeamUnits } from "@/lib/preseason/teams"
export type { TeamBucket, TeamPlayer } from "@/lib/preseason/teams"
export type { PlacementReason } from "@/lib/preseason/types"

export type Week3PlacedPlayer = PlacedPlayer<Week3Candidate>
export type PlacementUnit = PreseasonPlacementUnit<Week3Candidate>
export type DivisionPlacement = PreseasonDivisionPlacement<Week3Candidate>

export function buildTeamsForDivision(
    division: Week3Division,
    players: Week3PlacedPlayer[],
    isTopDivision = false
): TeamBucket[] {
    return buildTeamsForDivisionWithOptions(division, players, {
        newPlayersRequireCaptainedTeam: false,
        backCourt: isTopDivision
            ? {
                  divisionIndex: division.index,
                  requiredTeamCount: 6,
                  backTeamCount: 2
              }
            : null
    })
}

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

export const placementReasonOrder: PlacementReason[] = [
    "captain_locked",
    "mutual_pair_locked",
    "tryout2_same_division",
    "forced_move_up",
    "forced_move_down",
    "score_based"
]

export function buildDivisionPlacement(
    divisions: Week3Division[],
    candidates: Week3Candidate[]
): {
    placement: Map<number, DivisionPlacement>
    reasonByUser: Map<string, PlacementReason>
    lockedUserIds: Set<string>
} {
    const units = buildPlacementUnits(candidates)
    const targets = getDivisionTargets(divisions, candidates)
    const coachesDivisionIds = new Set(
        divisions.filter((d) => d.usesCoaches).map((d) => d.id)
    )
    const placement = new Map<number, DivisionPlacement>(
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
    const reasonByUser = new Map<string, PlacementReason>()
    const lockedUserIds = new Set<string>()
    const unitDivisionMap = new Map<string, number>()
    const divisionIndexById = new Map(
        divisions.map((division, index) => [division.id, index])
    )
    const unitByPlayerId = new Map<string, PlacementUnit>()

    for (const unit of units) {
        for (const player of unit.players) {
            unitByPlayerId.set(player.userId, unit)
        }
    }

    const placeUnit = (
        unit: PlacementUnit,
        divisionId: number,
        reason: PlacementReason,
        locked: boolean
    ) => {
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
    }

    const pickDivisionIdForUnit = (
        unit: PlacementUnit,
        preferredDivisionIndex: number | null
    ) => {
        const divisionOrder = divisions
            .map((division, index) => ({ division, index }))
            .sort((a, b) => {
                if (
                    preferredDivisionIndex === null ||
                    preferredDivisionIndex === undefined
                ) {
                    return a.index - b.index
                }

                const aDistance = Math.abs(a.index - preferredDivisionIndex)
                const bDistance = Math.abs(b.index - preferredDivisionIndex)

                if (aDistance !== bDistance) {
                    return aDistance - bDistance
                }

                return a.index - b.index
            })

        let bestDivisionId: number | null = null
        let bestTuple: [number, number, number, number, number] | null = null

        for (const { division, index } of divisionOrder) {
            const bucket = placement.get(division.id)
            if (!bucket) {
                continue
            }

            const projectedSize = bucket.size + unit.size
            const projectedMale = bucket.maleCount + unit.maleCount
            const projectedNonMale = bucket.nonMaleCount + unit.nonMaleCount

            const overflowPenalty = Math.max(
                0,
                projectedSize - bucket.targetSize
            )
            const genderPenalty =
                Math.abs(projectedMale - bucket.targetMale) +
                Math.abs(projectedNonMale - bucket.targetNonMale)
            const sizePenalty = Math.abs(projectedSize - bucket.targetSize)
            const distancePenalty =
                preferredDivisionIndex === null ||
                preferredDivisionIndex === undefined
                    ? 0
                    : Math.abs(index - preferredDivisionIndex)

            const tuple: [number, number, number, number, number] = [
                overflowPenalty,
                genderPenalty,
                sizePenalty,
                distancePenalty,
                bucket.size
            ]

            if (
                !bestTuple ||
                tuple[0] < bestTuple[0] ||
                (tuple[0] === bestTuple[0] && tuple[1] < bestTuple[1]) ||
                (tuple[0] === bestTuple[0] &&
                    tuple[1] === bestTuple[1] &&
                    tuple[2] < bestTuple[2]) ||
                (tuple[0] === bestTuple[0] &&
                    tuple[1] === bestTuple[1] &&
                    tuple[2] === bestTuple[2] &&
                    tuple[3] < bestTuple[3]) ||
                (tuple[0] === bestTuple[0] &&
                    tuple[1] === bestTuple[1] &&
                    tuple[2] === bestTuple[2] &&
                    tuple[3] === bestTuple[3] &&
                    tuple[4] < bestTuple[4])
            ) {
                bestTuple = tuple
                bestDivisionId = division.id
            }
        }

        return bestDivisionId
    }

    const moveUnitToDivision = (
        unit: PlacementUnit,
        targetDivisionId: number
    ) => {
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
    }

    for (const unit of units) {
        if (!unit.hasCaptain) {
            continue
        }

        // In coaches divisions the "captains" are coaches — treat as normal players
        if (
            unit.captainDivisionId &&
            coachesDivisionIds.has(unit.captainDivisionId)
        ) {
            continue
        }

        const preferredDivisionId = unit.captainDivisionId

        const targetDivisionId =
            (preferredDivisionId && placement.has(preferredDivisionId)
                ? preferredDivisionId
                : null) ?? pickDivisionIdForUnit(unit, null)

        if (!targetDivisionId) {
            continue
        }

        placeUnit(unit, targetDivisionId, "captain_locked", true)
        if (unit.isMutualPair) {
            for (const player of unit.players) {
                if (!player.isCaptain) {
                    reasonByUser.set(player.userId, "mutual_pair_locked")
                }
            }
        }
    }

    for (const unit of units) {
        if (unitDivisionMap.has(unit.id)) {
            continue
        }

        if (!unit.preferredWeek2DivisionId) {
            continue
        }

        if (!placement.has(unit.preferredWeek2DivisionId)) {
            continue
        }

        placeUnit(
            unit,
            unit.preferredWeek2DivisionId,
            "tryout2_same_division",
            false
        )
    }

    const forcedCandidates = [...candidates]
        .filter(
            (candidate) =>
                candidate.forcedMoveDirection === "up" ||
                candidate.forcedMoveDirection === "down"
        )
        .sort(compareCandidates)

    const processedForcedUnitIds = new Set<string>()

    for (const candidate of forcedCandidates) {
        if (lockedUserIds.has(candidate.userId)) {
            continue
        }

        const unit = unitByPlayerId.get(candidate.userId)
        if (!unit || processedForcedUnitIds.has(unit.id)) {
            continue
        }

        const currentDivisionId = unitDivisionMap.get(unit.id)
        if (!currentDivisionId) {
            continue
        }

        const currentDivisionIndex = divisionIndexById.get(currentDivisionId)
        if (currentDivisionIndex === undefined) {
            continue
        }

        const offset = candidate.forcedMoveDirection === "up" ? -1 : 1
        const targetDivisionIndex = Math.max(
            0,
            Math.min(divisions.length - 1, currentDivisionIndex + offset)
        )

        if (targetDivisionIndex === currentDivisionIndex) {
            continue
        }

        const targetDivisionId = divisions[targetDivisionIndex].id
        moveUnitToDivision(unit, targetDivisionId)
        const forcedReason =
            candidate.forcedMoveDirection === "up"
                ? "forced_move_up"
                : "forced_move_down"
        for (const player of unit.players) {
            reasonByUser.set(player.userId, forcedReason)
        }
        processedForcedUnitIds.add(unit.id)
    }

    const unassignedUnits = units.filter(
        (unit) => !unitDivisionMap.has(unit.id)
    )

    for (const unit of unassignedUnits) {
        const targetLevel = getScoreBandLevel(unit.averageScore, 50)

        const targetDivision = [...divisions].sort((a, b) => {
            const aDistance = Math.abs(a.level - targetLevel)
            const bDistance = Math.abs(b.level - targetLevel)
            if (aDistance !== bDistance) {
                return aDistance - bDistance
            }

            return a.level - b.level
        })[0]

        if (!targetDivision) {
            continue
        }

        placeUnit(unit, targetDivision.id, "score_based", false)
    }

    return {
        placement,
        reasonByUser,
        lockedUserIds
    }
}
