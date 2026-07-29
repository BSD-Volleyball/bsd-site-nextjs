// Week-2 placement logic: score-cascade division placement. Shared
// primitives (units, allocation) and the team engine live in
// src/lib/preseason; week 2 binds the team engine with its rule set
// (new players require a captained team, no back-court split).

import {
    addUnitToPlacement,
    buildPlacementUnits,
    removeUnitFromPlacement
} from "@/lib/preseason/units"
import { getDivisionTargets } from "@/lib/preseason/allocation"
import {
    buildTeamsForDivision as buildTeamsForDivisionWithOptions,
    type TeamBucket
} from "@/lib/preseason/teams"
import type {
    DivisionPlacement as PreseasonDivisionPlacement,
    PlacedPlayer,
    PlacementUnit as PreseasonPlacementUnit,
    Week2Candidate
} from "@/lib/preseason/types"
import type { Week2Division } from "./week2-types"

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

export type Week2PlacedPlayer = PlacedPlayer<Week2Candidate>
export type PlacementUnit = PreseasonPlacementUnit<Week2Candidate>
export type DivisionPlacement = PreseasonDivisionPlacement<Week2Candidate>

export function buildTeamsForDivision(
    division: Week2Division,
    players: Week2PlacedPlayer[]
): TeamBucket[] {
    return buildTeamsForDivisionWithOptions(division, players, {
        newPlayersRequireCaptainedTeam: true,
        backCourt: null
    })
}

export function buildDivisionPlacement(
    divisions: Week2Division[],
    candidates: Week2Candidate[]
): Map<number, DivisionPlacement> {
    const units = buildPlacementUnits(candidates)
    const targets = getDivisionTargets(divisions, candidates)
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

    const lastDivision = divisions[divisions.length - 1]
    const nonLastDivisions = divisions.slice(0, -1)

    for (const unit of units.filter((entry) => !!entry.captainDivisionId)) {
        const target = placement.get(unit.captainDivisionId as number)
        if (target) {
            addUnitToPlacement(target, unit)
        }
    }

    const nonLastBuckets = nonLastDivisions.map(
        (division) => placement.get(division.id) as DivisionPlacement
    )

    const canFitStrict = (bucket: DivisionPlacement, unit: PlacementUnit) => {
        return (
            bucket.size + unit.size <= bucket.targetSize &&
            bucket.maleCount + unit.maleCount <= bucket.targetMale &&
            bucket.nonMaleCount + unit.nonMaleCount <= bucket.targetNonMale
        )
    }

    const canFitSizeOnly = (bucket: DivisionPlacement, unit: PlacementUnit) => {
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
            addUnitToPlacement(nonLastBuckets[strictBucketIndex], unit)
            continue
        }

        const relaxedBucketIndex = nonLastBuckets.findIndex(
            (bucket, index) =>
                index >= preferredBucketIndex && canFitSizeOnly(bucket, unit)
        )

        if (relaxedBucketIndex !== -1) {
            addUnitToPlacement(nonLastBuckets[relaxedBucketIndex], unit)
            continue
        }

        const fallbackBucket = [...placement.values()].find((bucket) =>
            canFitSizeOnly(bucket, unit)
        )

        if (fallbackBucket) {
            addUnitToPlacement(fallbackBucket, unit)
            continue
        }

        addUnitToPlacement(
            placement.get(lastDivision.id) as DivisionPlacement,
            unit
        )
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

                removeUnitFromPlacement(lastBucket, candidateUnit)
                addUnitToPlacement(bucket, candidateUnit)
            }
        }
    }

    const orderedBuckets = divisions
        .map((division) => placement.get(division.id))
        .filter((bucket): bucket is DivisionPlacement => !!bucket)

    const getSwapCandidate = (
        bucket: DivisionPlacement,
        male: boolean,
        preference: "low" | "high"
    ) => {
        const candidates = bucket.units
            .filter((unit) => {
                if (unit.captainDivisionId || unit.size !== 1) {
                    return false
                }

                const player = unit.players[0]
                return male ? player.male === true : player.male !== true
            })
            .sort((a, b) => a.averageScore - b.averageScore)

        if (candidates.length === 0) {
            return null
        }

        return preference === "low"
            ? candidates[0]
            : candidates[candidates.length - 1]
    }

    const swapUnits = (
        source: DivisionPlacement,
        sourceUnit: PlacementUnit,
        target: DivisionPlacement,
        targetUnit: PlacementUnit
    ) => {
        removeUnitFromPlacement(source, sourceUnit)
        removeUnitFromPlacement(target, targetUnit)
        addUnitToPlacement(source, targetUnit)
        addUnitToPlacement(target, sourceUnit)
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

    return placement
}
