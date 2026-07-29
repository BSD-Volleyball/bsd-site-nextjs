// Capacity-aware allocation helpers shared by the week-2 and week-3 roster
// builders. Pure logic, unit-testable.

import { splitByGender } from "@/lib/utils"
import type { PreseasonDivision } from "./types"

/**
 * A division level is roughly one 50-point placement-score band; this maps a
 * score to the division level it "belongs" to (used for score-based division
 * fallback and duplicate-entry targeting).
 */
export function getScoreBandLevel(score: number, bandWidth: number) {
    return Math.floor(score / bandWidth) + 1
}

export function allocateByWeightWithCapacity(
    total: number,
    capacities: number[],
    weights: number[]
) {
    const result = Array(capacities.length).fill(0)

    if (total <= 0 || capacities.length === 0) {
        return result
    }

    const activeWeightTotal = weights.reduce((sum, value) => sum + value, 0)
    if (activeWeightTotal <= 0) {
        return result
    }

    const fractions = Array(capacities.length).fill(0)

    for (let index = 0; index < capacities.length; index++) {
        const exact = (total * weights[index]) / activeWeightTotal
        const floored = Math.min(capacities[index], Math.floor(exact))
        result[index] = floored
        fractions[index] = exact - Math.floor(exact)
    }

    let assigned = result.reduce((sum, value) => sum + value, 0)

    while (assigned < total) {
        let bestIndex = -1
        let bestFraction = -1
        let bestLoadRatio = Number.POSITIVE_INFINITY

        for (let index = 0; index < capacities.length; index++) {
            if (result[index] >= capacities[index]) {
                continue
            }

            const loadRatio =
                capacities[index] > 0
                    ? result[index] / capacities[index]
                    : Number.POSITIVE_INFINITY

            if (
                fractions[index] > bestFraction ||
                (fractions[index] === bestFraction && loadRatio < bestLoadRatio)
            ) {
                bestFraction = fractions[index]
                bestLoadRatio = loadRatio
                bestIndex = index
            }
        }

        if (bestIndex === -1) {
            break
        }

        result[bestIndex] += 1
        assigned += 1
    }

    return result
}

export function getSnakeOrder(length: number, teamCount: number) {
    const order: number[] = []
    let ascending = true

    while (order.length < length) {
        if (ascending) {
            for (let i = 0; i < teamCount && order.length < length; i++) {
                order.push(i)
            }
        } else {
            for (let i = teamCount - 1; i >= 0 && order.length < length; i--) {
                order.push(i)
            }
        }
        ascending = !ascending
    }

    return order
}

export function getDivisionTargets(
    divisions: PreseasonDivision[],
    candidates: Array<{ male: boolean | null }>
) {
    const totalPlayers = candidates.length
    const totalTeams = divisions.reduce(
        (sum, division) => sum + division.teamCount,
        0
    )

    if (totalTeams === 0) {
        return new Map<
            number,
            { size: number; male: number; nonMale: number }
        >()
    }

    const baseTeamSize = Math.floor(totalPlayers / totalTeams)
    const extraPlayers = totalPlayers - baseTeamSize * totalTeams

    const teamCounts = divisions.map((division) => division.teamCount)
    const sizeWeights = [...teamCounts]
    const extraPerDivision = allocateByWeightWithCapacity(
        extraPlayers,
        teamCounts,
        sizeWeights
    )

    const sizeTargets = divisions.map(
        (division, index) =>
            division.teamCount * baseTeamSize + extraPerDivision[index]
    )

    const totalNonMale = splitByGender(candidates).nonMales.length
    const nonMaleRatio = totalPlayers > 0 ? totalNonMale / totalPlayers : 0
    const nonMaleTargets = sizeTargets.map((size) =>
        Math.min(size, Math.floor(size * nonMaleRatio))
    )

    const assignedNonMale = nonMaleTargets.reduce(
        (sum, value) => sum + value,
        0
    )
    let remainingNonMale = totalNonMale - assignedNonMale

    if (remainingNonMale > 0) {
        const divisionOrder = divisions.map((_division, index) => index)

        while (remainingNonMale > 0) {
            let placedInPass = false

            for (const index of divisionOrder) {
                if (remainingNonMale <= 0) {
                    break
                }

                if (nonMaleTargets[index] >= sizeTargets[index]) {
                    continue
                }

                nonMaleTargets[index] += 1
                remainingNonMale -= 1
                placedInPass = true
            }

            if (!placedInPass) {
                break
            }
        }
    }

    const targets = new Map<
        number,
        { size: number; male: number; nonMale: number }
    >()

    for (let index = 0; index < divisions.length; index++) {
        const size = sizeTargets[index]
        const nonMale = nonMaleTargets[index]
        const male = size - nonMale
        targets.set(divisions[index].id, {
            size,
            male,
            nonMale
        })
    }

    return targets
}
