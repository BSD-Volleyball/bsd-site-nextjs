"use client"

import { RiDeleteBinLine, RiFileCopyLine } from "@remixicon/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { saveWeek2Rosters } from "./actions"
import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup
} from "@/components/player-detail"
import type {
    Week2Candidate,
    Week2Division,
    Week2ExcludedPlayer,
    Week2SavedAssignment
} from "./week2-types"

interface CreateWeek2FormProps {
    seasonLabel: string
    divisions: Week2Division[]
    candidates: Week2Candidate[]
    excludedPlayers: Week2ExcludedPlayer[]
    playerPicUrl: string
}

interface Week2PlacedPlayer extends Week2Candidate {
    entryId: string
    sourceUserId: string
    isDuplicateEntry: boolean
}

interface PlacementUnit {
    id: string
    players: Week2Candidate[]
    maleCount: number
    nonMaleCount: number
    size: number
    averageScore: number
    lockedDivisionId: number | null
}

interface DivisionPlacement {
    division: Week2Division
    units: PlacementUnit[]
    maleCount: number
    nonMaleCount: number
    size: number
    targetSize: number
    targetMale: number
    targetNonMale: number
}

interface TeamPlayer {
    entryId: string
    assignmentUserId: string
    displayName: string
    male: boolean | null
    placementScore: number
    isCaptain: boolean
    isNew: boolean
    pairEntryId: string | null
    pairName: string | null
    isDuplicateEntry: boolean
}

interface TeamBucket {
    number: number
    players: TeamPlayer[]
    scoreSum: number
    maleCount: number
    nonMaleCount: number
    newCount: number
}

function getDisplayName(player: Week2Candidate) {
    if (player.preferredName) {
        return `${player.preferredName} ${player.lastName}`
    }
    return `${player.firstName} ${player.lastName}`
}

function compareCandidates(a: Week2Candidate, b: Week2Candidate) {
    if (a.placementScore !== b.placementScore) {
        return a.placementScore - b.placementScore
    }

    return getDisplayName(a)
        .toLowerCase()
        .localeCompare(getDisplayName(b).toLowerCase())
}

function sortDivisionPlayers(players: Week2PlacedPlayer[]) {
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

function toOriginalPlacedPlayer(candidate: Week2Candidate): Week2PlacedPlayer {
    return {
        ...candidate,
        entryId: `orig:${candidate.userId}`,
        sourceUserId: candidate.userId,
        isDuplicateEntry: false
    }
}

function buildPlacementUnits(candidates: Week2Candidate[]): PlacementUnit[] {
    const sorted = [...candidates].sort(compareCandidates)
    const byId = new Map(
        sorted.map((candidate) => [candidate.userId, candidate])
    )
    const used = new Set<string>()
    const units: PlacementUnit[] = []

    for (const candidate of sorted) {
        if (used.has(candidate.userId)) {
            continue
        }

        const partner = candidate.pairUserId
            ? byId.get(candidate.pairUserId)
            : null

        const canPair =
            !!partner &&
            !used.has(partner.userId) &&
            partner.pairUserId === candidate.userId &&
            !(
                candidate.captainDivisionId &&
                partner.captainDivisionId &&
                candidate.captainDivisionId !== partner.captainDivisionId
            )

        const players = canPair ? [candidate, partner] : [candidate]
        const maleCount = players.filter(
            (player) => player.male === true
        ).length
        const nonMaleCount = players.length - maleCount
        const averageScore =
            players.reduce((sum, player) => sum + player.placementScore, 0) /
            players.length

        const lockedDivisionId =
            players.find((player) => !!player.captainDivisionId)
                ?.captainDivisionId || null

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
            lockedDivisionId
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

function addUnitToPlacement(target: DivisionPlacement, unit: PlacementUnit) {
    target.units.push(unit)
    target.size += unit.size
    target.maleCount += unit.maleCount
    target.nonMaleCount += unit.nonMaleCount
}

function removeUnitFromPlacement(
    target: DivisionPlacement,
    unit: PlacementUnit
) {
    target.units = target.units.filter((entry) => entry.id !== unit.id)
    target.size -= unit.size
    target.maleCount -= unit.maleCount
    target.nonMaleCount -= unit.nonMaleCount
}

function allocateByWeightWithCapacity(
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

function getDivisionTargets(
    divisions: Week2Division[],
    candidates: Week2Candidate[]
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

    const totalNonMale = candidates.filter(
        (candidate) => candidate.male !== true
    ).length
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

function buildDivisionPlacement(
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

    for (const unit of units.filter((entry) => !!entry.lockedDivisionId)) {
        const target = placement.get(unit.lockedDivisionId as number)
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

    for (const unit of units.filter((entry) => !entry.lockedDivisionId)) {
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
                    if (unit.lockedDivisionId) {
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
                if (unit.lockedDivisionId || unit.size !== 1) {
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

function buildTeamUnits(players: TeamPlayer[]): Array<{
    id: string
    players: TeamPlayer[]
    maleCount: number
    nonMaleCount: number
    newCount: number
    size: number
    averageScore: number
}> {
    const sorted = [...players].sort((a, b) => {
        if (a.placementScore !== b.placementScore) {
            return a.placementScore - b.placementScore
        }
        return a.displayName.localeCompare(b.displayName)
    })
    const byId = new Map(sorted.map((player) => [player.entryId, player]))
    const used = new Set<string>()
    const result: Array<{
        id: string
        players: TeamPlayer[]
        maleCount: number
        nonMaleCount: number
        newCount: number
        size: number
        averageScore: number
    }> = []

    for (const player of sorted) {
        if (used.has(player.entryId)) {
            continue
        }

        const partner = player.pairEntryId ? byId.get(player.pairEntryId) : null
        const isMutualPair = !!partner && partner.pairEntryId === player.entryId
        const pairPlayers =
            isMutualPair && !used.has(partner.entryId)
                ? [player, partner]
                : [player]

        const maleCount = pairPlayers.filter(
            (entry) => entry.male === true
        ).length
        const nonMaleCount = pairPlayers.length - maleCount
        const newCount = pairPlayers.filter((entry) => entry.isNew).length
        const averageScore =
            pairPlayers.reduce((sum, entry) => sum + entry.placementScore, 0) /
            pairPlayers.length

        result.push({
            id: pairPlayers
                .map((entry) => entry.entryId)
                .sort()
                .join(":"),
            players: pairPlayers,
            maleCount,
            nonMaleCount,
            newCount,
            size: pairPlayers.length,
            averageScore
        })

        for (const entry of pairPlayers) {
            used.add(entry.entryId)
        }
    }

    return result.sort((a, b) => a.averageScore - b.averageScore)
}

function getSnakeOrder(length: number, teamCount: number) {
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

function buildTeamsForDivision(
    division: Week2Division,
    players: Week2PlacedPlayer[]
): TeamBucket[] {
    const teamCount = division.teamCount
    const teams: TeamBucket[] = Array.from(
        { length: teamCount },
        (_, index) => ({
            number: index + 1,
            players: [],
            scoreSum: 0,
            maleCount: 0,
            nonMaleCount: 0,
            newCount: 0
        })
    )

    const baseTeamSize = Math.floor(players.length / teamCount)
    const largerTeamCount = players.length % teamCount
    const teamCapacities = Array.from({ length: teamCount }, (_entry, index) =>
        index < largerTeamCount ? baseTeamSize + 1 : baseTeamSize
    )

    const divisionPlayers: TeamPlayer[] = players.map((player) => ({
        entryId: player.entryId,
        assignmentUserId: player.sourceUserId,
        displayName: getDisplayName(player),
        male: player.male,
        placementScore: player.placementScore,
        isCaptain: player.isCaptain,
        isNew: player.overallMostRecent === null,
        pairEntryId: null,
        pairName: null,
        isDuplicateEntry: player.isDuplicateEntry
    }))

    const displayNameByUserId = new Map(
        players.map((player) => [player.sourceUserId, getDisplayName(player)])
    )
    const primaryEntryIdByUserId = new Map(
        players
            .filter((player) => !player.isDuplicateEntry)
            .map((player) => [player.sourceUserId, player.entryId])
    )

    for (const player of divisionPlayers) {
        const source = players.find(
            (candidate) => candidate.entryId === player.entryId
        )
        const pairUserId =
            source && !source.isDuplicateEntry ? source.pairUserId : null

        player.pairEntryId = pairUserId
            ? (primaryEntryIdByUserId.get(pairUserId) ?? null)
            : null
        player.pairName = pairUserId
            ? (displayNameByUserId.get(pairUserId) ?? null)
            : null
    }

    const captains = divisionPlayers
        .filter((player) => player.isCaptain)
        .sort((a, b) => a.placementScore - b.placementScore)

    const assignedCaptainIds = new Set<string>()
    for (let i = 0; i < captains.length && i < teamCount; i++) {
        const captain = captains[i]
        const captainMutualPair = captain.pairEntryId
            ? (divisionPlayers.find(
                  (p) =>
                      p.entryId === captain.pairEntryId &&
                      p.pairEntryId === captain.entryId &&
                      !assignedCaptainIds.has(p.entryId)
              ) ?? null)
            : null
        const toPlace = captainMutualPair
            ? [captain, captainMutualPair]
            : [captain]

        for (const player of toPlace) {
            teams[i].players.push(player)
            teams[i].scoreSum += player.placementScore
            if (player.male === true) {
                teams[i].maleCount += 1
            } else {
                teams[i].nonMaleCount += 1
            }
            if (player.isNew) {
                teams[i].newCount += 1
            }
            assignedCaptainIds.add(player.entryId)
        }
    }

    const teamsWithCaptain = new Set(
        captains
            .slice(0, teamCount)
            .map((_, i) => i)
    )

    const remaining = divisionPlayers.filter(
        (player) => !assignedCaptainIds.has(player.entryId)
    )
    const units = buildTeamUnits(remaining)
    const snakeOrder = getSnakeOrder(units.length, teamCount)

    const totalMale = players.filter((player) => player.male === true).length
    const teamMaleTargets = allocateByWeightWithCapacity(
        totalMale,
        teamCapacities,
        teamCapacities.map(() => 1)
    )
    const teamNonMaleTargets = teamCapacities.map(
        (capacity, index) => capacity - teamMaleTargets[index]
    )
    const totalNew = divisionPlayers.filter((player) => player.isNew).length
    const teamNewTargets = allocateByWeightWithCapacity(
        totalNew,
        teamCapacities,
        teamCapacities.map(() => 1)
    )
    const getTeamSlotIndex = (teamIndex: number) => Math.floor(teamIndex / 2)
    const maxSlotIndex = Math.floor((teamCount - 1) / 2)

    const getDuplicatePlacementPenalty = (
        unitPlayers: TeamPlayer[],
        candidateTeamIndex: number
    ) => {
        const candidateSlot = getTeamSlotIndex(candidateTeamIndex)

        for (const unitPlayer of unitPlayers) {
            const existingTeamIndex = teams.findIndex((team) =>
                team.players.some(
                    (player) =>
                        player.assignmentUserId === unitPlayer.assignmentUserId
                )
            )

            if (existingTeamIndex === -1) {
                continue
            }

            const existingSlot = getTeamSlotIndex(existingTeamIndex)
            const slotDistance = Math.abs(candidateSlot - existingSlot)

            if (slotDistance === 0) {
                return 1_000_000
            }

            if (slotDistance !== 1) {
                return 10_000
            }
        }

        return 0
    }

    const recomputeTeamStats = (team: TeamBucket) => {
        team.scoreSum = team.players.reduce(
            (sum, player) => sum + player.placementScore,
            0
        )
        team.maleCount = team.players.filter(
            (player) => player.male === true
        ).length
        team.nonMaleCount = team.players.length - team.maleCount
        team.newCount = team.players.filter((player) => player.isNew).length
    }

    const getDuplicateOccurrences = (assignmentUserId: string) => {
        const occurrences: Array<{ teamIndex: number; playerIndex: number }> =
            []

        for (let teamIndex = 0; teamIndex < teams.length; teamIndex++) {
            const team = teams[teamIndex]
            for (
                let playerIndex = 0;
                playerIndex < team.players.length;
                playerIndex++
            ) {
                if (
                    team.players[playerIndex].assignmentUserId ===
                    assignmentUserId
                ) {
                    occurrences.push({ teamIndex, playerIndex })
                }
            }
        }

        return occurrences
    }

    const hasValidDuplicateSlots = (assignmentUserId: string) => {
        const occurrences = getDuplicateOccurrences(assignmentUserId)
        if (occurrences.length < 2) {
            return true
        }

        const firstSlot = getTeamSlotIndex(occurrences[0].teamIndex)
        const secondSlot = getTeamSlotIndex(occurrences[1].teamIndex)
        return (
            firstSlot !== secondSlot && Math.abs(firstSlot - secondSlot) === 1
        )
    }

    const tryRepairDuplicateSlots = (assignmentUserId: string) => {
        const occurrences = getDuplicateOccurrences(assignmentUserId)
        if (occurrences.length !== 2) {
            return true
        }

        if (hasValidDuplicateSlots(assignmentUserId)) {
            return true
        }

        for (
            let sourceIndex = 0;
            sourceIndex < occurrences.length;
            sourceIndex++
        ) {
            const source = occurrences[sourceIndex]
            const other = occurrences[(sourceIndex + 1) % 2]
            const sourceTeam = teams[source.teamIndex]
            const sourcePlayer = sourceTeam.players[source.playerIndex]
            const otherSlot = getTeamSlotIndex(other.teamIndex)
            const candidateSlots = [otherSlot - 1, otherSlot + 1].filter(
                (slot) => slot >= 0 && slot <= maxSlotIndex
            )

            for (let teamIndex = 0; teamIndex < teams.length; teamIndex++) {
                if (
                    teamIndex === source.teamIndex ||
                    !candidateSlots.includes(getTeamSlotIndex(teamIndex))
                ) {
                    continue
                }

                if (
                    !division.isCoachDiv &&
                    sourcePlayer.isNew &&
                    !teamsWithCaptain.has(teamIndex)
                ) {
                    continue
                }

                const targetTeam = teams[teamIndex]
                const targetCandidates = targetTeam.players
                    .map((player, playerIndex) => ({ player, playerIndex }))
                    .filter(
                        ({ player }) =>
                            !player.isCaptain &&
                            !player.pairEntryId &&
                            player.assignmentUserId !== assignmentUserId &&
                            !(
                                !division.isCoachDiv &&
                                player.isNew &&
                                !teamsWithCaptain.has(source.teamIndex)
                            )
                    )
                    .sort((a, b) => {
                        const aMismatch =
                            Number(a.player.male !== sourcePlayer.male) +
                            Number(a.player.isNew !== sourcePlayer.isNew)
                        const bMismatch =
                            Number(b.player.male !== sourcePlayer.male) +
                            Number(b.player.isNew !== sourcePlayer.isNew)
                        if (aMismatch !== bMismatch) {
                            return aMismatch - bMismatch
                        }

                        return (
                            Math.abs(
                                a.player.placementScore -
                                    sourcePlayer.placementScore
                            ) -
                            Math.abs(
                                b.player.placementScore -
                                    sourcePlayer.placementScore
                            )
                        )
                    })

                const targetCandidate = targetCandidates[0]
                if (!targetCandidate) {
                    continue
                }

                sourceTeam.players[source.playerIndex] = targetCandidate.player
                targetTeam.players[targetCandidate.playerIndex] = sourcePlayer
                recomputeTeamStats(sourceTeam)
                recomputeTeamStats(targetTeam)

                if (hasValidDuplicateSlots(assignmentUserId)) {
                    return true
                }

                targetTeam.players[targetCandidate.playerIndex] =
                    targetCandidate.player
                sourceTeam.players[source.playerIndex] = sourcePlayer
                recomputeTeamStats(sourceTeam)
                recomputeTeamStats(targetTeam)
            }
        }

        return false
    }

    for (let unitIndex = 0; unitIndex < units.length; unitIndex++) {
        const unit = units[unitIndex]
        const preferredTeam = snakeOrder[unitIndex]
        const priorities = [
            preferredTeam,
            ...teams
                .map((_team, index) => index)
                .filter((index) => index !== preferredTeam)
        ]

        let bestTeamIndex = priorities[0]
        let bestTuple: [number, number, number, number, number, number] | null =
            null

        for (const teamIndex of priorities) {
            const team = teams[teamIndex]

            const projectedSize = team.players.length + unit.size
            const projectedMale = team.maleCount + unit.maleCount
            const projectedNonMale = team.nonMaleCount + unit.nonMaleCount
            const projectedNew = team.newCount + unit.newCount
            const teamCapacity = teamCapacities[teamIndex]
            const teamMaleTarget = teamMaleTargets[teamIndex]
            const teamNonMaleTarget = teamNonMaleTargets[teamIndex]
            const teamNewTarget = teamNewTargets[teamIndex]

            if (projectedSize > teamCapacity) {
                continue
            }

            if (
                !division.isCoachDiv &&
                unit.newCount > 0 &&
                !teamsWithCaptain.has(teamIndex)
            ) {
                continue
            }

            let constraintPenalty = 0

            if (!division.isLast) {
                const strictPass =
                    projectedSize <= teamCapacity &&
                    projectedMale <= teamMaleTarget &&
                    projectedNonMale <= teamNonMaleTarget

                const relaxedPass = projectedSize <= teamCapacity

                if (strictPass) {
                    constraintPenalty = 0
                } else if (relaxedPass) {
                    constraintPenalty = 1
                } else {
                    constraintPenalty = 2
                }
            } else {
                if (projectedSize <= teamCapacity) {
                    constraintPenalty = 0
                } else {
                    constraintPenalty = 1
                }
            }

            const projectedScores = teams.map(
                (entry, index) =>
                    entry.scoreSum +
                    (index === teamIndex ? unit.averageScore * unit.size : 0)
            )
            const spread =
                Math.max(...projectedScores) - Math.min(...projectedScores)

            const sizePenalty = Math.abs(projectedSize - teamCapacity)
            const genderPenalty =
                Math.abs(projectedMale - teamMaleTarget) +
                Math.abs(projectedNonMale - teamNonMaleTarget)
            const newPenalty = Math.abs(projectedNew - teamNewTarget)
            const duplicatePenalty = getDuplicatePlacementPenalty(
                unit.players,
                teamIndex
            )

            const tuple: [number, number, number, number, number, number] = [
                constraintPenalty,
                duplicatePenalty,
                genderPenalty,
                newPenalty,
                spread,
                sizePenalty
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
                    tuple[4] < bestTuple[4]) ||
                (tuple[0] === bestTuple[0] &&
                    tuple[1] === bestTuple[1] &&
                    tuple[2] === bestTuple[2] &&
                    tuple[3] === bestTuple[3] &&
                    tuple[4] === bestTuple[4] &&
                    tuple[5] < bestTuple[5])
            ) {
                bestTuple = tuple
                bestTeamIndex = teamIndex
            }
        }

        if (!bestTuple) {
            const fallbackCandidates = teams
                .map((entry, index) => ({
                    index,
                    remaining: teamCapacities[index] - entry.players.length,
                    duplicatePenalty: getDuplicatePlacementPenalty(
                        unit.players,
                        index
                    ),
                    hasCaptain: teamsWithCaptain.has(index)
                }))
                .filter((entry) => entry.remaining >= unit.size)

            const preferCaptained =
                !division.isCoachDiv && unit.newCount > 0
                    ? fallbackCandidates.filter((entry) => entry.hasCaptain)
                    : []

            const pool =
                preferCaptained.length > 0
                    ? preferCaptained
                    : fallbackCandidates

            const fallbackIndex = pool.sort((a, b) => {
                if (a.duplicatePenalty !== b.duplicatePenalty) {
                    return a.duplicatePenalty - b.duplicatePenalty
                }
                return b.remaining - a.remaining
            })[0]?.index

            if (fallbackIndex !== undefined) {
                bestTeamIndex = fallbackIndex
            }
        }

        for (const player of unit.players) {
            teams[bestTeamIndex].players.push(player)
            teams[bestTeamIndex].scoreSum += player.placementScore
            if (player.male === true) {
                teams[bestTeamIndex].maleCount += 1
            } else {
                teams[bestTeamIndex].nonMaleCount += 1
            }
            if (player.isNew) {
                teams[bestTeamIndex].newCount += 1
            }
        }
    }

    const trySwapGender = (sourceIndex: number, targetIndex: number) => {
        const sourceTeam = teams[sourceIndex]
        const targetTeam = teams[targetIndex]

        const sourceCandidates = sourceTeam.players
            .map((player, index) => ({ player, index }))
            .filter(
                ({ player }) =>
                    player.male !== true &&
                    !player.isCaptain &&
                    !player.pairEntryId &&
                    !(
                        !division.isCoachDiv &&
                        player.isNew &&
                        !teamsWithCaptain.has(targetIndex)
                    )
            )

        const targetCandidates = targetTeam.players
            .map((player, index) => ({ player, index }))
            .filter(
                ({ player }) =>
                    player.male === true &&
                    !player.isCaptain &&
                    !player.pairEntryId &&
                    !(
                        !division.isCoachDiv &&
                        player.isNew &&
                        !teamsWithCaptain.has(sourceIndex)
                    )
            )

        if (sourceCandidates.length === 0 || targetCandidates.length === 0) {
            return false
        }

        let bestSwap: {
            sourcePlayerIndex: number
            targetPlayerIndex: number
            scoreDiff: number
        } | null = null

        for (const sourceCandidate of sourceCandidates) {
            for (const targetCandidate of targetCandidates) {
                const scoreDiff = Math.abs(
                    sourceCandidate.player.placementScore -
                        targetCandidate.player.placementScore
                )

                if (!bestSwap || scoreDiff < bestSwap.scoreDiff) {
                    bestSwap = {
                        sourcePlayerIndex: sourceCandidate.index,
                        targetPlayerIndex: targetCandidate.index,
                        scoreDiff
                    }
                }
            }
        }

        if (!bestSwap) {
            return false
        }

        const sourcePlayer = sourceTeam.players[bestSwap.sourcePlayerIndex]
        const targetPlayer = targetTeam.players[bestSwap.targetPlayerIndex]

        sourceTeam.players[bestSwap.sourcePlayerIndex] = targetPlayer
        targetTeam.players[bestSwap.targetPlayerIndex] = sourcePlayer

        sourceTeam.maleCount += 1
        sourceTeam.nonMaleCount -= 1
        targetTeam.maleCount -= 1
        targetTeam.nonMaleCount += 1

        sourceTeam.newCount +=
            (targetPlayer.isNew ? 1 : 0) - (sourcePlayer.isNew ? 1 : 0)
        targetTeam.newCount +=
            (sourcePlayer.isNew ? 1 : 0) - (targetPlayer.isNew ? 1 : 0)

        sourceTeam.scoreSum +=
            targetPlayer.placementScore - sourcePlayer.placementScore
        targetTeam.scoreSum +=
            sourcePlayer.placementScore - targetPlayer.placementScore

        return true
    }

    for (let pass = 0; pass < 20; pass++) {
        const surpluses = teams
            .map((team, index) => ({
                index,
                delta: team.nonMaleCount - teamNonMaleTargets[index]
            }))
            .filter((entry) => entry.delta > 0)
            .sort((a, b) => b.delta - a.delta)

        const deficits = teams
            .map((team, index) => ({
                index,
                delta: team.nonMaleCount - teamNonMaleTargets[index]
            }))
            .filter((entry) => entry.delta < 0)
            .sort((a, b) => a.delta - b.delta)

        if (surpluses.length === 0 || deficits.length === 0) {
            break
        }

        let changed = false

        for (const source of surpluses) {
            for (const target of deficits) {
                if (trySwapGender(source.index, target.index)) {
                    changed = true
                    break
                }
            }
            if (changed) {
                break
            }
        }

        if (!changed) {
            break
        }
    }

    const trySwapNewPlayer = (sourceIndex: number, targetIndex: number) => {
        const sourceTeam = teams[sourceIndex]
        const targetTeam = teams[targetIndex]

        const sourceCandidates = sourceTeam.players
            .map((player, index) => ({ player, index }))
            .filter(
                ({ player }) =>
                    player.isNew && !player.isCaptain && !player.pairEntryId
            )

        const targetCandidates = targetTeam.players
            .map((player, index) => ({ player, index }))
            .filter(
                ({ player }) =>
                    !player.isNew && !player.isCaptain && !player.pairEntryId
            )

        if (sourceCandidates.length === 0 || targetCandidates.length === 0) {
            return false
        }

        let bestSwap: {
            sourcePlayerIndex: number
            targetPlayerIndex: number
            scoreDiff: number
        } | null = null

        for (const sourceCandidate of sourceCandidates) {
            for (const targetCandidate of targetCandidates) {
                if (
                    sourceCandidate.player.male !== targetCandidate.player.male
                ) {
                    continue
                }

                const scoreDiff = Math.abs(
                    sourceCandidate.player.placementScore -
                        targetCandidate.player.placementScore
                )

                if (!bestSwap || scoreDiff < bestSwap.scoreDiff) {
                    bestSwap = {
                        sourcePlayerIndex: sourceCandidate.index,
                        targetPlayerIndex: targetCandidate.index,
                        scoreDiff
                    }
                }
            }
        }

        if (!bestSwap) {
            return false
        }

        const sourcePlayer = sourceTeam.players[bestSwap.sourcePlayerIndex]
        const targetPlayer = targetTeam.players[bestSwap.targetPlayerIndex]

        sourceTeam.players[bestSwap.sourcePlayerIndex] = targetPlayer
        targetTeam.players[bestSwap.targetPlayerIndex] = sourcePlayer

        sourceTeam.newCount -= 1
        targetTeam.newCount += 1

        sourceTeam.scoreSum +=
            targetPlayer.placementScore - sourcePlayer.placementScore
        targetTeam.scoreSum +=
            sourcePlayer.placementScore - targetPlayer.placementScore

        return true
    }

    for (let pass = 0; pass < 12; pass++) {
        const surpluses = teams
            .map((team, index) => ({
                index,
                delta: team.newCount - teamNewTargets[index]
            }))
            .filter((entry) => entry.delta > 0)
            .sort((a, b) => b.delta - a.delta)

        const deficits = teams
            .map((team, index) => ({
                index,
                delta: team.newCount - teamNewTargets[index]
            }))
            .filter((entry) => entry.delta < 0)
            .sort((a, b) => a.delta - b.delta)

        if (surpluses.length === 0 || deficits.length === 0) {
            break
        }

        let changed = false

        for (const source of surpluses) {
            for (const target of deficits) {
                if (
                    !division.isCoachDiv &&
                    !teamsWithCaptain.has(target.index)
                ) {
                    continue
                }
                if (trySwapNewPlayer(source.index, target.index)) {
                    changed = true
                    break
                }
            }
            if (changed) {
                break
            }
        }

        if (!changed) {
            break
        }
    }

    const trySwapScoreBalance = (highIndex: number, lowIndex: number) => {
        const highTeam = teams[highIndex]
        const lowTeam = teams[lowIndex]

        if (highTeam.scoreSum <= lowTeam.scoreSum) {
            return false
        }

        const highCandidates = highTeam.players
            .map((player, index) => ({ player, index }))
            .filter(
                ({ player }) =>
                    !player.isCaptain &&
                    !player.pairEntryId &&
                    !(
                        !division.isCoachDiv &&
                        player.isNew &&
                        !teamsWithCaptain.has(lowIndex)
                    )
            )

        const lowCandidates = lowTeam.players
            .map((player, index) => ({ player, index }))
            .filter(
                ({ player }) =>
                    !player.isCaptain &&
                    !player.pairEntryId &&
                    !(
                        !division.isCoachDiv &&
                        player.isNew &&
                        !teamsWithCaptain.has(highIndex)
                    )
            )

        if (highCandidates.length === 0 || lowCandidates.length === 0) {
            return false
        }

        const currentSpread =
            Math.max(...teams.map((team) => team.scoreSum)) -
            Math.min(...teams.map((team) => team.scoreSum))

        let bestSwap: {
            highPlayerIndex: number
            lowPlayerIndex: number
            resultingSpread: number
        } | null = null

        for (const highCandidate of highCandidates) {
            for (const lowCandidate of lowCandidates) {
                if (highCandidate.player.male !== lowCandidate.player.male) {
                    continue
                }

                if (highCandidate.player.isNew !== lowCandidate.player.isNew) {
                    continue
                }

                const highProjected =
                    highTeam.scoreSum -
                    highCandidate.player.placementScore +
                    lowCandidate.player.placementScore
                const lowProjected =
                    lowTeam.scoreSum -
                    lowCandidate.player.placementScore +
                    highCandidate.player.placementScore

                const projectedSums = teams.map((team, index) => {
                    if (index === highIndex) {
                        return highProjected
                    }
                    if (index === lowIndex) {
                        return lowProjected
                    }
                    return team.scoreSum
                })

                const projectedSpread =
                    Math.max(...projectedSums) - Math.min(...projectedSums)

                if (projectedSpread >= currentSpread) {
                    continue
                }

                if (!bestSwap || projectedSpread < bestSwap.resultingSpread) {
                    bestSwap = {
                        highPlayerIndex: highCandidate.index,
                        lowPlayerIndex: lowCandidate.index,
                        resultingSpread: projectedSpread
                    }
                }
            }
        }

        if (!bestSwap) {
            return false
        }

        const highPlayer = highTeam.players[bestSwap.highPlayerIndex]
        const lowPlayer = lowTeam.players[bestSwap.lowPlayerIndex]

        highTeam.players[bestSwap.highPlayerIndex] = lowPlayer
        lowTeam.players[bestSwap.lowPlayerIndex] = highPlayer

        highTeam.scoreSum +=
            lowPlayer.placementScore - highPlayer.placementScore
        lowTeam.scoreSum += highPlayer.placementScore - lowPlayer.placementScore

        return true
    }

    for (let pass = 0; pass < 24; pass++) {
        const orderedByScore = teams
            .map((team, index) => ({ index, scoreSum: team.scoreSum }))
            .sort((a, b) => b.scoreSum - a.scoreSum)

        const high = orderedByScore[0]
        const low = orderedByScore[orderedByScore.length - 1]

        if (!high || !low || high.scoreSum <= low.scoreSum) {
            break
        }

        const changed = trySwapScoreBalance(high.index, low.index)
        if (!changed) {
            break
        }
    }

    for (let pass = 0; pass < 8; pass++) {
        const duplicateUserIds = new Set<string>()
        for (const team of teams) {
            for (const player of team.players) {
                if (player.isDuplicateEntry) {
                    duplicateUserIds.add(player.assignmentUserId)
                }
            }
        }

        if (duplicateUserIds.size === 0) {
            break
        }

        let changed = false
        for (const assignmentUserId of duplicateUserIds) {
            if (hasValidDuplicateSlots(assignmentUserId)) {
                continue
            }

            const repaired = tryRepairDuplicateSlots(assignmentUserId)
            if (repaired) {
                changed = true
            }
        }

        if (!changed) {
            break
        }
    }

    for (const team of teams) {
        team.players.sort((a, b) => {
            if (a.isCaptain !== b.isCaptain) {
                return a.isCaptain ? -1 : 1
            }
            if (a.placementScore !== b.placementScore) {
                return a.placementScore - b.placementScore
            }
            return a.displayName.localeCompare(b.displayName)
        })
    }

    return teams
}

export function CreateWeek2Form({
    seasonLabel,
    divisions,
    candidates,
    excludedPlayers,
    playerPicUrl
}: CreateWeek2FormProps) {
    const [step, setStep] = useState<1 | 2>(1)
    const modal = usePlayerDetailModal()
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const duplicateCounterRef = useRef(0)

    const eligibleMaleCount = useMemo(
        () => candidates.filter((candidate) => candidate.male === true).length,
        [candidates]
    )
    const eligibleNonMaleCount = useMemo(
        () => candidates.length - eligibleMaleCount,
        [candidates.length, eligibleMaleCount]
    )

    const placement = useMemo(
        () => buildDivisionPlacement(divisions, candidates),
        [divisions, candidates]
    )

    const initialDivisionPlayers = useMemo(() => {
        const result = new Map<number, Week2PlacedPlayer[]>()

        for (const division of divisions) {
            const bucket = placement.get(division.id)
            if (!bucket) {
                result.set(division.id, [])
                continue
            }

            const players = sortDivisionPlayers(
                bucket.units
                    .flatMap((unit) => unit.players)
                    .map(toOriginalPlacedPlayer)
            )

            result.set(division.id, players)
        }

        return result
    }, [divisions, placement])

    const [editableDivisionPlayers, setEditableDivisionPlayers] = useState(
        initialDivisionPlayers
    )

    useEffect(() => {
        setEditableDivisionPlayers(initialDivisionPlayers)
    }, [initialDivisionPlayers])

    const handleResetStepOne = () => {
        setEditableDivisionPlayers(initialDivisionPlayers)
        setError(null)
        setMessage(null)
    }

    const duplicateCountBySourceUserId = useMemo(() => {
        const counts = new Map<string, number>()
        for (const players of editableDivisionPlayers.values()) {
            for (const player of players) {
                counts.set(
                    player.sourceUserId,
                    (counts.get(player.sourceUserId) ?? 0) + 1
                )
            }
        }
        return counts
    }, [editableDivisionPlayers])

    const captainPairIds = useMemo(() => {
        const captainIds = new Set(
            candidates.filter((c) => c.isCaptain).map((c) => c.userId)
        )
        const result = new Set<string>()
        for (const candidate of candidates) {
            if (candidate.pairUserId && captainIds.has(candidate.pairUserId)) {
                result.add(candidate.userId)
            }
        }
        return result
    }, [candidates])

    const handleMoveDivision = (
        divisionIndex: number,
        entryId: string,
        direction: -1 | 1
    ) => {
        setError(null)
        setMessage(null)

        const targetDivisionIndex = divisionIndex + direction
        if (
            targetDivisionIndex < 0 ||
            targetDivisionIndex >= divisions.length
        ) {
            return
        }

        const sourceDivisionId = divisions[divisionIndex].id
        const targetDivisionId = divisions[targetDivisionIndex].id

        const sourcePlayersCurrent =
            editableDivisionPlayers.get(sourceDivisionId) || []
        const targetPlayersCurrent =
            editableDivisionPlayers.get(targetDivisionId) || []

        const selectedPlayer = sourcePlayersCurrent.find(
            (player) => player.entryId === entryId
        )

        if (!selectedPlayer) {
            return
        }

        if (
            selectedPlayer.isCaptain ||
            captainPairIds.has(selectedPlayer.sourceUserId)
        ) {
            setError(
                "Captains and their paired partners cannot be moved between divisions."
            )
            return
        }

        const movingPlayers: Week2PlacedPlayer[] = [selectedPlayer]

        if (selectedPlayer.pairUserId && !selectedPlayer.isDuplicateEntry) {
            const partner = sourcePlayersCurrent.find(
                (player) =>
                    player.sourceUserId === selectedPlayer.pairUserId &&
                    !player.isDuplicateEntry
            )
            if (
                !partner ||
                partner.pairUserId !== selectedPlayer.sourceUserId
            ) {
                setError(
                    "Paired player move requires both pair members in the same division."
                )
                return
            }
            movingPlayers.push(partner)
        }

        const movingIds = new Set(movingPlayers.map((player) => player.entryId))

        const nextSourcePlayers = sortDivisionPlayers([
            ...sourcePlayersCurrent.filter(
                (player) => !movingIds.has(player.entryId)
            )
        ])

        const nextTargetPlayers = sortDivisionPlayers([
            ...targetPlayersCurrent,
            ...movingPlayers
        ])

        const nextMap = new Map(editableDivisionPlayers)
        nextMap.set(sourceDivisionId, nextSourcePlayers)
        nextMap.set(targetDivisionId, nextTargetPlayers)
        setEditableDivisionPlayers(nextMap)
    }

    const handleDuplicatePlayer = (divisionIndex: number, entryId: string) => {
        setError(null)
        setMessage(null)

        const sourceDivision = divisions[divisionIndex]
        if (!sourceDivision) {
            return
        }

        const sourcePlayersCurrent =
            editableDivisionPlayers.get(sourceDivision.id) || []
        const selectedPlayer = sourcePlayersCurrent.find(
            (player) => player.entryId === entryId
        )

        if (!selectedPlayer) {
            return
        }

        if (
            selectedPlayer.isCaptain ||
            captainPairIds.has(selectedPlayer.sourceUserId)
        ) {
            setError("Captains and their paired partners cannot be duplicated.")
            return
        }

        const existingCount =
            duplicateCountBySourceUserId.get(selectedPlayer.sourceUserId) ?? 1
        if (existingCount >= 2) {
            setError("A player can only appear twice.")
            return
        }

        const aboveDivision = divisions[divisionIndex - 1] ?? null
        const belowDivision = divisions[divisionIndex + 1] ?? null

        if (!aboveDivision && !belowDivision) {
            setError("No adjacent division is available for duplication.")
            return
        }

        const targetLevel = Math.floor(selectedPlayer.placementScore / 50) + 1
        const getDistance = (division: Week2Division) =>
            Math.abs(division.level - targetLevel)

        let targetDivision = aboveDivision || belowDivision
        if (aboveDivision && belowDivision) {
            const aboveDistance = getDistance(aboveDivision)
            const belowDistance = getDistance(belowDivision)
            targetDivision =
                aboveDistance <= belowDistance ? aboveDivision : belowDivision
        }

        if (!targetDivision) {
            return
        }

        duplicateCounterRef.current += 1

        const duplicate: Week2PlacedPlayer = {
            ...selectedPlayer,
            entryId: `dup:${selectedPlayer.sourceUserId}:${duplicateCounterRef.current}`,
            sourceUserId: selectedPlayer.sourceUserId,
            isDuplicateEntry: true,
            isCaptain: false,
            captainDivisionId: null,
            captainDivisionName: null,
            pairUserId: null,
            pairWithName: null
        }

        const targetPlayersCurrent =
            editableDivisionPlayers.get(targetDivision.id) || []
        const nextTargetPlayers = sortDivisionPlayers([
            ...targetPlayersCurrent,
            duplicate
        ])

        const nextMap = new Map(editableDivisionPlayers)
        nextMap.set(targetDivision.id, nextTargetPlayers)
        setEditableDivisionPlayers(nextMap)
    }

    const handleRemoveDuplicate = (entryId: string) => {
        setError(null)
        setMessage(null)

        const nextMap = new Map(editableDivisionPlayers)
        for (const division of divisions) {
            const players = nextMap.get(division.id) || []
            const target = players.find((player) => player.entryId === entryId)
            if (!target || !target.isDuplicateEntry) {
                continue
            }

            nextMap.set(
                division.id,
                sortDivisionPlayers(
                    players.filter((player) => player.entryId !== entryId)
                )
            )
            setEditableDivisionPlayers(nextMap)
            return
        }
    }

    const pairAverageScoreByUser = useMemo(() => {
        const result = new Map<string, number>()

        const playersById = new Map<string, Week2PlacedPlayer>()
        for (const players of editableDivisionPlayers.values()) {
            for (const player of players) {
                playersById.set(player.sourceUserId, player)
            }
        }

        const seen = new Set<string>()

        for (const player of playersById.values()) {
            if (!player.pairUserId) {
                continue
            }

            const partner = playersById.get(player.pairUserId)
            if (!partner || partner.pairUserId !== player.sourceUserId) {
                continue
            }

            const key =
                player.sourceUserId < partner.sourceUserId
                    ? `${player.sourceUserId}:${partner.sourceUserId}`
                    : `${partner.sourceUserId}:${player.sourceUserId}`

            if (seen.has(key)) {
                continue
            }

            seen.add(key)
            const average = (player.placementScore + partner.placementScore) / 2
            result.set(player.sourceUserId, average)
            result.set(partner.sourceUserId, average)
        }

        return result
    }, [editableDivisionPlayers])

    const teamAssignments = useMemo(() => {
        return divisions.map((division) => ({
            division,
            teams: buildTeamsForDivision(
                division,
                editableDivisionPlayers.get(division.id) || []
            )
        }))
    }, [editableDivisionPlayers, divisions])

    const playsTwiceAssignmentUserIds = useMemo(() => {
        const counts = new Map<string, number>()

        for (const divisionResult of teamAssignments) {
            for (const team of divisionResult.teams) {
                for (const player of team.players) {
                    counts.set(
                        player.assignmentUserId,
                        (counts.get(player.assignmentUserId) ?? 0) + 1
                    )
                }
            }
        }

        return new Set(
            Array.from(counts.entries())
                .filter(([, count]) => count > 1)
                .map(([assignmentUserId]) => assignmentUserId)
        )
    }, [teamAssignments])

    const savePayload = useMemo<Week2SavedAssignment[]>(() => {
        const payload: Week2SavedAssignment[] = []

        for (const divisionResult of teamAssignments) {
            for (const team of divisionResult.teams) {
                for (const player of team.players) {
                    payload.push({
                        userId: player.assignmentUserId,
                        divisionId: divisionResult.division.id,
                        teamNumber: team.number,
                        isCaptain: player.isCaptain
                    })
                }
            }
        }

        return payload
    }, [teamAssignments])

    const handleSave = async () => {
        setError(null)
        setMessage(null)

        if (savePayload.length === 0) {
            setError("No assignments available to save.")
            return
        }

        setIsSaving(true)

        const result = await saveWeek2Rosters(savePayload)

        if (result.status) {
            setMessage(result.message)
        } else {
            setError(result.message)
        }

        setIsSaving(false)
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>
                        Season: {seasonLabel} | Eligible Players:{" "}
                        {candidates.length} ({eligibleMaleCount} male /{" "}
                        {eligibleNonMaleCount} non-male)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant={step === 1 ? "default" : "outline"}
                            onClick={() => setStep(1)}
                        >
                            Step 1: Division Split
                        </Button>
                        <Button
                            type="button"
                            variant={step === 2 ? "default" : "outline"}
                            onClick={() => setStep(2)}
                        >
                            Step 2: Team Split
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleResetStepOne}
                        >
                            Reset Step 1
                        </Button>
                    </div>
                    {error && (
                        <p className="text-red-700 text-sm dark:text-red-300">
                            {error}
                        </p>
                    )}
                </CardContent>
            </Card>

            {step === 1 && (
                <div className="grid gap-4 xl:grid-cols-2">
                    {divisions.map((division, index) => {
                        const bucket = placement.get(division.id)
                        const players =
                            editableDivisionPlayers.get(division.id) || []
                        const targetLabel = "Dynamic team-size target"
                        const actualMaleCount = players.filter(
                            (player) => player.male === true
                        ).length
                        const actualNonMaleCount =
                            players.length - actualMaleCount

                        return (
                            <Card key={division.id}>
                                <CardHeader>
                                    <CardTitle>
                                        {index + 1}. {division.name} |{" "}
                                        {players.length} players
                                    </CardTitle>
                                    <p className="text-muted-foreground text-sm">
                                        {targetLabel}
                                        {bucket
                                            ? ` | target ${bucket.targetSize} (${bucket.targetMale} male / ${bucket.targetNonMale} non-male) | actual ${actualMaleCount} male / ${actualNonMaleCount} non-male`
                                            : ""}
                                    </p>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-0.5">
                                        {players.map((player) => (
                                            <div
                                                key={player.entryId}
                                                className={cn(
                                                    "flex items-center justify-between rounded-sm border px-2 py-0.5 text-xs",
                                                    player.isCaptain &&
                                                        "border-primary bg-primary/10"
                                                )}
                                            >
                                                <div className="min-w-0 flex-1 truncate pr-2">
                                                    <button
                                                        type="button"
                                                        className="font-medium underline-offset-2 hover:underline"
                                                        onClick={() =>
                                                            modal.openPlayerDetail(
                                                                player.sourceUserId
                                                            )
                                                        }
                                                    >
                                                        {getDisplayName(player)}
                                                    </button>
                                                    {player.seasonsPlayedCount ===
                                                    0 ? (
                                                        <span className="ml-2 font-semibold text-green-600 dark:text-green-400">
                                                            NEW
                                                        </span>
                                                    ) : player.lastDivisionName ? (
                                                        <span
                                                            className={cn(
                                                                "ml-2",
                                                                player.lastDivisionName !==
                                                                    division.name
                                                                    ? "font-semibold text-red-600 dark:text-red-400"
                                                                    : "text-muted-foreground"
                                                            )}
                                                        >
                                                            {
                                                                player.lastDivisionName
                                                            }
                                                        </span>
                                                    ) : null}
                                                    {player.pairWithName && (
                                                        <span className="ml-2 text-muted-foreground">
                                                            pair:{" "}
                                                            {
                                                                player.pairWithName
                                                            }
                                                        </span>
                                                    )}
                                                    {player.isCaptain && (
                                                        <span className="ml-2 font-semibold text-primary">
                                                            CAPTAIN (locked)
                                                        </span>
                                                    )}
                                                    {!player.isCaptain &&
                                                        captainPairIds.has(
                                                            player.sourceUserId
                                                        ) && (
                                                            <span className="ml-2 font-semibold text-primary">
                                                                (locked with
                                                                captain)
                                                            </span>
                                                        )}
                                                    {(duplicateCountBySourceUserId.get(
                                                        player.sourceUserId
                                                    ) ?? 1) > 1 && (
                                                        <span className="ml-2 font-semibold">
                                                            plays twice
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="ml-2 flex items-center gap-1">
                                                    <span className="text-muted-foreground">
                                                        {Math.round(
                                                            player.placementScore
                                                        )}
                                                        {pairAverageScoreByUser.has(
                                                            player.sourceUserId
                                                        ) && (
                                                            <span>
                                                                {" "}
                                                                (pair avg{" "}
                                                                {Math.round(
                                                                    pairAverageScoreByUser.get(
                                                                        player.sourceUserId
                                                                    ) || 0
                                                                )}
                                                                )
                                                            </span>
                                                        )}{" "}
                                                        |{" "}
                                                        {player.male === true
                                                            ? "M"
                                                            : "NM"}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 px-1.5"
                                                        onClick={() =>
                                                            handleMoveDivision(
                                                                index,
                                                                player.entryId,
                                                                -1
                                                            )
                                                        }
                                                        disabled={
                                                            index === 0 ||
                                                            player.isCaptain ||
                                                            captainPairIds.has(
                                                                player.sourceUserId
                                                            )
                                                        }
                                                    >
                                                        ↑
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 px-1.5"
                                                        onClick={() =>
                                                            handleMoveDivision(
                                                                index,
                                                                player.entryId,
                                                                1
                                                            )
                                                        }
                                                        disabled={
                                                            index ===
                                                                divisions.length -
                                                                    1 ||
                                                            player.isCaptain ||
                                                            captainPairIds.has(
                                                                player.sourceUserId
                                                            )
                                                        }
                                                    >
                                                        ↓
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 px-1.5"
                                                        onClick={() =>
                                                            handleDuplicatePlayer(
                                                                index,
                                                                player.entryId
                                                            )
                                                        }
                                                        disabled={
                                                            player.isCaptain ||
                                                            captainPairIds.has(
                                                                player.sourceUserId
                                                            ) ||
                                                            (duplicateCountBySourceUserId.get(
                                                                player.sourceUserId
                                                            ) ?? 1) >= 2
                                                        }
                                                    >
                                                        <RiFileCopyLine className="h-3.5 w-3.5" />
                                                    </Button>
                                                    {player.isDuplicateEntry && (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-6 px-1.5"
                                                            onClick={() =>
                                                                handleRemoveDuplicate(
                                                                    player.entryId
                                                                )
                                                            }
                                                        >
                                                            <RiDeleteBinLine className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            {step === 2 && (
                <div className="space-y-4">
                    {teamAssignments.map(({ division, teams }) => (
                        <Card key={`teams-${division.id}`}>
                            <CardHeader>
                                <CardTitle>
                                    {division.name} | {teams.length} teams
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    {teams.map((team) => (
                                        <div
                                            key={`${division.id}-${team.number}`}
                                            className="space-y-2 rounded-md border p-3"
                                        >
                                            <div className="flex items-center justify-between">
                                                <h3 className="font-semibold text-sm">
                                                    Team {team.number}
                                                </h3>
                                                <span className="text-muted-foreground text-xs">
                                                    {team.players.length} |{" "}
                                                    {team.maleCount} M /{" "}
                                                    {team.nonMaleCount} NM
                                                </span>
                                            </div>
                                            <div className="space-y-1">
                                                {team.players.map((player) => (
                                                    <div
                                                        key={`${division.id}-${team.number}-${player.entryId}`}
                                                        className={cn(
                                                            "flex items-center justify-between rounded-sm px-2 py-1 text-xs",
                                                            player.male === true
                                                                ? "bg-sky-100 text-sky-900 dark:bg-sky-950/45 dark:text-sky-100"
                                                                : "bg-violet-100 text-violet-900 dark:bg-violet-950/45 dark:text-violet-100",
                                                            player.isCaptain &&
                                                                "border border-primary"
                                                        )}
                                                    >
                                                        <span className="truncate">
                                                            {player.displayName}
                                                            {player.pairName && (
                                                                <span className="ml-2 opacity-90">
                                                                    (pair:{" "}
                                                                    {
                                                                        player.pairName
                                                                    }
                                                                    )
                                                                </span>
                                                            )}
                                                            {player.isNew && (
                                                                <span className="ml-2 font-semibold">
                                                                    *NEW*
                                                                </span>
                                                            )}
                                                            {player.isCaptain && (
                                                                <span className="ml-2 font-semibold">
                                                                    Captain
                                                                </span>
                                                            )}
                                                            {playsTwiceAssignmentUserIds.has(
                                                                player.assignmentUserId
                                                            ) && (
                                                                <span className="ml-2 font-semibold">
                                                                    plays twice
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="text-muted-foreground">
                                                            {Math.round(
                                                                player.placementScore
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    <div className="flex items-center gap-3">
                        <Button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving || savePayload.length === 0}
                        >
                            {isSaving ? "Saving..." : "Save Week 2 Rosters"}
                        </Button>
                        {message && (
                            <span className="text-green-700 text-sm dark:text-green-300">
                                {message}
                            </span>
                        )}
                        {error && (
                            <span className="text-red-700 text-sm dark:text-red-300">
                                {error}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {step === 1 && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            Excluded (missing tryout 2 date):{" "}
                            {excludedPlayers.length}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {excludedPlayers.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No players were excluded for missing the tryout
                                2 date.
                            </p>
                        ) : (
                            <div className="space-y-1">
                                {excludedPlayers.map((player) => (
                                    <div
                                        key={player.userId}
                                        className="rounded-sm border px-2 py-1 text-xs"
                                    >
                                        <span className="font-medium">
                                            {player.preferredName
                                                ? `${player.preferredName} ${player.lastName}`
                                                : `${player.firstName} ${player.lastName}`}
                                        </span>
                                        {player.oldId !== null && (
                                            <span className="ml-2 text-muted-foreground">
                                                [{player.oldId}]
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
            <AdminPlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={modal.closePlayerDetail}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                signupHistory={modal.signupHistory}
                playerPicUrl={playerPicUrl}
                isLoading={modal.isLoading}
                pairPickName={modal.pairPickName}
                pairReason={modal.pairReason}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
                viewerRating={modal.viewerRating}
            />
        </div>
    )
}
