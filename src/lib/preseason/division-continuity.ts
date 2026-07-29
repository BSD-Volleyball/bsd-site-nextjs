// Week-3 division-placement strategy: continuity-driven. Captains lock to
// their captained division; everyone else defaults to their week-2 division;
// forced moving-day rows shift exactly one division (clamped); players with
// no week-2 appearance are placed by score band.

import { buildPlacementUnits, compareCandidates } from "./units"
import { getScoreBandLevel } from "./allocation"
import { createPlacementTracker, initDivisionBuckets } from "./placement-shared"
import type {
    DivisionPlacementResult,
    PlacementUnit,
    PreseasonDivision,
    Week3Candidate
} from "./types"

export function buildContinuityDivisionPlacement(
    divisions: PreseasonDivision[],
    candidates: Week3Candidate[]
): DivisionPlacementResult<Week3Candidate> {
    const units = buildPlacementUnits(candidates)
    const coachesDivisionIds = new Set(
        divisions.filter((d) => d.usesCoaches).map((d) => d.id)
    )
    const placement = initDivisionBuckets(divisions, candidates)
    const tracker = createPlacementTracker(placement)
    const divisionIndexById = new Map(
        divisions.map((division, index) => [division.id, index])
    )
    const unitByPlayerId = new Map<string, PlacementUnit<Week3Candidate>>()

    for (const unit of units) {
        for (const player of unit.players) {
            unitByPlayerId.set(player.userId, unit)
        }
    }

    const pickDivisionIdForUnit = (
        unit: PlacementUnit<Week3Candidate>,
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

        tracker.placeUnit(unit, targetDivisionId, "captain_locked", true)
        if (unit.isMutualPair) {
            for (const player of unit.players) {
                if (!player.isCaptain) {
                    tracker.setReason(player.userId, "mutual_pair_locked")
                }
            }
        }
    }

    for (const unit of units) {
        if (tracker.getUnitDivisionId(unit.id) !== undefined) {
            continue
        }

        if (!unit.preferredWeek2DivisionId) {
            continue
        }

        if (!placement.has(unit.preferredWeek2DivisionId)) {
            continue
        }

        tracker.placeUnit(
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
        if (tracker.lockedUserIds.has(candidate.userId)) {
            continue
        }

        const unit = unitByPlayerId.get(candidate.userId)
        if (!unit || processedForcedUnitIds.has(unit.id)) {
            continue
        }

        const currentDivisionId = tracker.getUnitDivisionId(unit.id)
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
        tracker.moveUnitToDivision(unit, targetDivisionId)
        const forcedReason =
            candidate.forcedMoveDirection === "up"
                ? "forced_move_up"
                : "forced_move_down"
        for (const player of unit.players) {
            tracker.setReason(player.userId, forcedReason)
        }
        processedForcedUnitIds.add(unit.id)
    }

    const unassignedUnits = units.filter(
        (unit) => tracker.getUnitDivisionId(unit.id) === undefined
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

        tracker.placeUnit(unit, targetDivision.id, "score_based", false)
    }

    return {
        placement,
        reasonByUser: tracker.reasonByUser,
        lockedUserIds: tracker.lockedUserIds
    }
}
