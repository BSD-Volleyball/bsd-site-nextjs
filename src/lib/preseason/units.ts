// Candidate ordering and pair-unit building shared by the week-2 and week-3
// roster builders. Pure logic, unit-testable.

import { formatDisplayName, splitByGender } from "@/lib/utils"
import type {
    DivisionPlacement,
    PlacedPlayer,
    PlacementUnit,
    PreseasonCandidate
} from "./types"

export function getDisplayName(player: PreseasonCandidate) {
    return formatDisplayName(
        player.firstName,
        player.lastName,
        player.preferredName
    )
}

export function compareCandidates(
    a: PreseasonCandidate,
    b: PreseasonCandidate
) {
    if (a.placementScore !== b.placementScore) {
        return a.placementScore - b.placementScore
    }

    return getDisplayName(a)
        .toLowerCase()
        .localeCompare(getDisplayName(b).toLowerCase())
}

export function sortDivisionPlayers<C extends PreseasonCandidate>(
    players: PlacedPlayer<C>[]
) {
    return [...players].sort((a, b) => {
        if (a.male === true && b.male !== true) {
            return -1
        }
        if (a.male !== true && b.male === true) {
            return 1
        }
        return compareCandidates(a, b)
    })
}

export function toOriginalPlacedPlayer<C extends PreseasonCandidate>(
    candidate: C
): PlacedPlayer<C> {
    return {
        ...candidate,
        entryId: `orig:${candidate.userId}`,
        sourceUserId: candidate.userId,
        isDuplicateEntry: false
    }
}

export function buildPlacementUnits<C extends PreseasonCandidate>(
    candidates: C[]
): PlacementUnit<C>[] {
    const sorted = [...candidates].sort(compareCandidates)
    const byId = new Map(
        sorted.map((candidate) => [candidate.userId, candidate])
    )
    const used = new Set<string>()
    const units: PlacementUnit<C>[] = []

    for (const candidate of sorted) {
        if (used.has(candidate.userId)) {
            continue
        }

        const partner = candidate.pairUserId
            ? byId.get(candidate.pairUserId)
            : null

        // Pairs must share a week-2 division when that data exists; for week 2
        // both sides are undefined, so the clause is vacuous.
        const canPair =
            !!partner &&
            !used.has(partner.userId) &&
            partner.pairUserId === candidate.userId &&
            (candidate.week2DivisionId ?? null) ===
                (partner.week2DivisionId ?? null) &&
            !(
                candidate.captainDivisionId &&
                partner.captainDivisionId &&
                candidate.captainDivisionId !== partner.captainDivisionId
            )

        const players = canPair && partner ? [candidate, partner] : [candidate]
        const { males, nonMales } = splitByGender(players)
        const maleCount = males.length
        const nonMaleCount = nonMales.length
        const averageScore =
            players.reduce((sum, player) => sum + player.placementScore, 0) /
            players.length

        const captainDivisionId =
            players.find((player) => !!player.captainDivisionId)
                ?.captainDivisionId || null
        const week2DivisionCandidates = players
            .map((player) => player.week2DivisionId)
            .filter((value): value is number => typeof value === "number")
        const preferredWeek2DivisionId =
            week2DivisionCandidates.length > 0
                ? week2DivisionCandidates[0]
                : null

        const unitId = players
            .map((player) => player.userId)
            .sort()
            .join(":")

        units.push({
            id: unitId,
            players,
            maleCount,
            nonMaleCount,
            size: players.length,
            averageScore,
            hasCaptain: players.some((player) => player.isCaptain),
            isMutualPair: players.length > 1,
            captainDivisionId,
            preferredWeek2DivisionId
        })

        for (const player of players) {
            used.add(player.userId)
        }
    }

    return units.sort((a, b) => {
        if (a.averageScore !== b.averageScore) {
            return a.averageScore - b.averageScore
        }
        return a.id.localeCompare(b.id)
    })
}

export function addUnitToPlacement<C extends PreseasonCandidate>(
    target: DivisionPlacement<C>,
    unit: PlacementUnit<C>
) {
    target.units.push(unit)
    target.size += unit.size
    target.maleCount += unit.maleCount
    target.nonMaleCount += unit.nonMaleCount
}

export function removeUnitFromPlacement<C extends PreseasonCandidate>(
    target: DivisionPlacement<C>,
    unit: PlacementUnit<C>
) {
    target.units = target.units.filter((entry) => entry.id !== unit.id)
    target.size -= unit.size
    target.maleCount -= unit.maleCount
    target.nonMaleCount -= unit.nonMaleCount
}
