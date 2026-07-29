// Week-2 division-placement strategy: captains lock to their captained
// division, then everyone else cascades top-down in ascending score order
// against size/gender targets, followed by a last-division pull-back pass
// and adjacent-division gender swaps.

import { buildPlacementUnits } from "./units"
import { createPlacementTracker, initDivisionBuckets } from "./placement-shared"
import type {
    DivisionPlacement,
    DivisionPlacementResult,
    PlacementUnit,
    PreseasonCandidate,
    PreseasonDivision
} from "./types"

export function buildCascadeDivisionPlacement<C extends PreseasonCandidate>(
    divisions: PreseasonDivision[],
    candidates: C[]
): DivisionPlacementResult<C> {
    const units = buildPlacementUnits(candidates)
    const placement = initDivisionBuckets(divisions, candidates)
    const tracker = createPlacementTracker(placement)

    const lastDivision = divisions[divisions.length - 1]
    const nonLastDivisions = divisions.slice(0, -1)

    for (const unit of units.filter((entry) => !!entry.captainDivisionId)) {
        tracker.placeUnit(
            unit,
            unit.captainDivisionId as number,
            "captain_locked",
            true
        )
        if (unit.isMutualPair) {
            for (const player of unit.players) {
                if (!player.isCaptain) {
                    tracker.setReason(player.userId, "mutual_pair_locked")
                }
            }
        }
    }

    const nonLastBuckets = nonLastDivisions.map(
        (division) => placement.get(division.id) as DivisionPlacement<C>
    )

    const canFitStrict = (
        bucket: DivisionPlacement<C>,
        unit: PlacementUnit<C>
    ) => {
        return (
            bucket.size + unit.size <= bucket.targetSize &&
            bucket.maleCount + unit.maleCount <= bucket.targetMale &&
            bucket.nonMaleCount + unit.nonMaleCount <= bucket.targetNonMale
        )
    }

    const canFitSizeOnly = (
        bucket: DivisionPlacement<C>,
        unit: PlacementUnit<C>
    ) => {
        return bucket.size + unit.size <= bucket.targetSize
    }

    let preferredBucketIndex = 0

    for (const unit of units.filter((entry) => !entry.captainDivisionId)) {
        while (
            preferredBucketIndex < nonLastBuckets.length &&
            nonLastBuckets[preferredBucketIndex].size >=
                nonLastBuckets[preferredBucketIndex].targetSize
        ) {
            preferredBucketIndex += 1
        }

        const strictBucketIndex = nonLastBuckets.findIndex(
            (bucket, index) =>
                index >= preferredBucketIndex && canFitStrict(bucket, unit)
        )

        if (strictBucketIndex !== -1) {
            tracker.placeUnit(
                unit,
                nonLastBuckets[strictBucketIndex].division.id,
                "score_cascade",
                false
            )
            continue
        }

        const relaxedBucketIndex = nonLastBuckets.findIndex(
            (bucket, index) =>
                index >= preferredBucketIndex && canFitSizeOnly(bucket, unit)
        )

        if (relaxedBucketIndex !== -1) {
            tracker.placeUnit(
                unit,
                nonLastBuckets[relaxedBucketIndex].division.id,
                "score_cascade",
                false
            )
            continue
        }

        const fallbackBucket = [...placement.values()].find((bucket) =>
            canFitSizeOnly(bucket, unit)
        )

        if (fallbackBucket) {
            tracker.placeUnit(
                unit,
                fallbackBucket.division.id,
                "score_cascade",
                false
            )
            continue
        }

        tracker.placeUnit(unit, lastDivision.id, "score_cascade", false)
    }

    const lastBucket = placement.get(lastDivision.id)

    if (lastBucket) {
        for (const division of nonLastDivisions) {
            const bucket = placement.get(division.id)
            if (!bucket) {
                continue
            }

            while (bucket.size < bucket.targetSize) {
                const candidateUnit = lastBucket.units.find((unit) => {
                    if (unit.captainDivisionId) {
                        return false
                    }

                    if (!canFitSizeOnly(bucket, unit)) {
                        return false
                    }

                    return canFitStrict(bucket, unit)
                })

                if (!candidateUnit) {
                    break
                }

                tracker.moveUnitToDivision(candidateUnit, division.id)
            }
        }
    }

    const orderedBuckets = divisions
        .map((division) => placement.get(division.id))
        .filter((bucket): bucket is DivisionPlacement<C> => !!bucket)

    const getSwapCandidate = (
        bucket: DivisionPlacement<C>,
        male: boolean,
        preference: "low" | "high"
    ) => {
        const swappable = bucket.units
            .filter((unit) => {
                if (unit.captainDivisionId || unit.size !== 1) {
                    return false
                }

                const player = unit.players[0]
                return male ? player.male === true : player.male !== true
            })
            .sort((a, b) => a.averageScore - b.averageScore)

        if (swappable.length === 0) {
            return null
        }

        return preference === "low"
            ? swappable[0]
            : swappable[swappable.length - 1]
    }

    const swapUnits = (
        source: DivisionPlacement<C>,
        sourceUnit: PlacementUnit<C>,
        target: DivisionPlacement<C>,
        targetUnit: PlacementUnit<C>
    ) => {
        tracker.moveUnitToDivision(sourceUnit, target.division.id)
        tracker.moveUnitToDivision(targetUnit, source.division.id)
    }

    for (let pass = 0; pass < 6; pass++) {
        let changed = false

        for (let index = 0; index < orderedBuckets.length - 1; index++) {
            const upper = orderedBuckets[index]
            const lower = orderedBuckets[index + 1]

            const upperMaleDelta = upper.maleCount - upper.targetMale
            const lowerMaleDelta = lower.maleCount - lower.targetMale

            if (upperMaleDelta > 0 && lowerMaleDelta < 0) {
                const maleFromUpper = getSwapCandidate(upper, true, "high")
                const nonMaleFromLower = getSwapCandidate(lower, false, "low")

                if (maleFromUpper && nonMaleFromLower) {
                    swapUnits(upper, maleFromUpper, lower, nonMaleFromLower)
                    changed = true
                }
            } else if (upperMaleDelta < 0 && lowerMaleDelta > 0) {
                const nonMaleFromUpper = getSwapCandidate(upper, false, "high")
                const maleFromLower = getSwapCandidate(lower, true, "low")

                if (nonMaleFromUpper && maleFromLower) {
                    swapUnits(upper, nonMaleFromUpper, lower, maleFromLower)
                    changed = true
                }
            }
        }

        if (!changed) {
            break
        }
    }

    return {
        placement,
        reasonByUser: tracker.reasonByUser,
        lockedUserIds: tracker.lockedUserIds
    }
}
