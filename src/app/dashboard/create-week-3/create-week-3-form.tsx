"use client"

import { RiDeleteBinLine, RiFileCopyLine } from "@remixicon/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { saveWeek3Rosters } from "./actions"
import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup
} from "@/components/player-detail"
import type {
    Week3Candidate,
    Week3Division,
    Week3ExcludedPlayer,
    Week3SavedAssignment
} from "./week3-types"

interface CreateWeek3FormProps {
    seasonLabel: string
    divisions: Week3Division[]
    candidates: Week3Candidate[]
    excludedPlayers: Week3ExcludedPlayer[]
    playerPicUrl: string
}

interface Week3PlacedPlayer extends Week3Candidate {
    entryId: string
    sourceUserId: string
    isDuplicateEntry: boolean
}

interface PlacementUnit {
    id: string
    players: Week3Candidate[]
    maleCount: number
    nonMaleCount: number
    size: number
    averageScore: number
    hasCaptain: boolean
    isMutualPair: boolean
    captainDivisionId: number | null
    preferredWeek2DivisionId: number | null
}

interface DivisionPlacement {
    division: Week3Division
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
    ratingScore: number | null
    consecutiveSeasonsInTopDiv: number
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

type PlacementReason =
    | "captain_locked"
    | "mutual_pair_locked"
    | "tryout2_same_division"
    | "forced_move_up"
    | "forced_move_down"
    | "score_based"

const placementReasonLabel: Record<PlacementReason, string> = {
    captain_locked: "Captain (locked)",
    mutual_pair_locked: "Paired with captain (locked)",
    tryout2_same_division: "Played in Week 2 division",
    forced_move_up: "Forced move up",
    forced_move_down: "Forced move down",
    score_based: "Did not play week 2"
}

const placementReasonClasses: Record<PlacementReason, string> = {
    captain_locked:
        "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100",
    mutual_pair_locked:
        "border-orange-300 bg-orange-100 text-orange-950 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-100",
    tryout2_same_division:
        "border-blue-300 bg-blue-100 text-blue-950 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-100",
    forced_move_up:
        "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100",
    forced_move_down:
        "border-rose-300 bg-rose-100 text-rose-950 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-100",
    score_based:
        "border-slate-300 bg-slate-100 text-slate-950 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-100"
}

const placementReasonOrder: PlacementReason[] = [
    "captain_locked",
    "mutual_pair_locked",
    "tryout2_same_division",
    "forced_move_up",
    "forced_move_down",
    "score_based"
]

function getDisplayName(player: Week3Candidate) {
    if (player.preferredName) {
        return `${player.preferredName} ${player.lastName}`
    }
    return `${player.firstName} ${player.lastName}`
}

function compareCandidates(a: Week3Candidate, b: Week3Candidate) {
    if (a.placementScore !== b.placementScore) {
        return a.placementScore - b.placementScore
    }

    return getDisplayName(a)
        .toLowerCase()
        .localeCompare(getDisplayName(b).toLowerCase())
}

function sortDivisionPlayers(players: Week3PlacedPlayer[]) {
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

function toOriginalPlacedPlayer(candidate: Week3Candidate): Week3PlacedPlayer {
    return {
        ...candidate,
        entryId: `orig:${candidate.userId}`,
        sourceUserId: candidate.userId,
        isDuplicateEntry: false
    }
}

function buildPlacementUnits(candidates: Week3Candidate[]): PlacementUnit[] {
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
            candidate.week2DivisionId === partner.week2DivisionId &&
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

        const captainDivisionId =
            players.find((player) => !!player.captainDivisionId)
                ?.captainDivisionId || null
        const week2DivisionCandidates = players
            .map((player) => player.week2DivisionId)
            .filter((value): value is number => value !== null)
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
    divisions: Week3Division[],
    candidates: Week3Candidate[]
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
        const targetLevel = Math.floor(unit.averageScore / 50) + 1

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
    division: Week3Division,
    players: Week3PlacedPlayer[],
    isTopDivision = false
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
        ratingScore: player.ratingScore,
        consecutiveSeasonsInTopDiv: player.consecutiveSeasonsInTopDiv,
        // Coaches are treated as regular players in team building
        isCaptain: division.usesCoaches ? false : player.isCaptain,
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

    // Pre-assign teams 5 and 6 for the top division (AA):
    // fill them with the most experienced non-captains before the main loop runs.
    const preAssignedEntryIds = new Set<string>()
    // Back-court per-team gender targets (populated below when isTopDivision)
    let backTeam4NonMaleTarget = 0
    let backTeam5NonMaleTarget = 0

    if (isTopDivision && teamCount === 6) {
        const BACK_START = 4
        const backCourtCapacity =
            teamCapacities[BACK_START] + teamCapacities[BACK_START + 1]

        const totalMaleForBack = players.filter((p) => p.male === true).length
        const nonMaleRatioForBack =
            players.length > 0
                ? (players.length - totalMaleForBack) / players.length
                : 0.5
        const backNonMaleTarget = Math.min(
            backCourtCapacity,
            Math.round(backCourtCapacity * nonMaleRatioForBack)
        )
        const backMaleTarget = backCourtCapacity - backNonMaleTarget

        // Per-team non-male targets for teams 5 and 6 (used later for gender balance)
        backTeam4NonMaleTarget = Math.round(
            teamCapacities[BACK_START] * nonMaleRatioForBack
        )
        backTeam5NonMaleTarget = backNonMaleTarget - backTeam4NonMaleTarget

        // Build units from non-captains, excluding new players and players
        // paired with a captain or a new player (who must stay on teams 1–4).
        const captainEntryIds = new Set(
            divisionPlayers.filter((p) => p.isCaptain).map((p) => p.entryId)
        )
        const newPlayerEntryIds = new Set(
            divisionPlayers.filter((p) => p.isNew).map((p) => p.entryId)
        )
        const eligibleUnits = buildTeamUnits(
            divisionPlayers.filter(
                (p) =>
                    !p.isCaptain &&
                    !p.isNew &&
                    !(p.pairEntryId && captainEntryIds.has(p.pairEntryId)) &&
                    !(p.pairEntryId && newPlayerEntryIds.has(p.pairEntryId))
            )
        )
        eligibleUnits.sort((a, b) => {
            const aMax = Math.max(
                ...a.players.map((p) => p.consecutiveSeasonsInTopDiv)
            )
            const bMax = Math.max(
                ...b.players.map((p) => p.consecutiveSeasonsInTopDiv)
            )
            if (aMax !== bMax) {
                return bMax - aMax
            }
            return a.averageScore - b.averageScore
        })

        // Greedily select units respecting gender targets
        const backCourtUnits: (typeof eligibleUnits)[number][] = []
        let bcMale = 0
        let bcNonMale = 0

        for (const unit of eligibleUnits) {
            if (bcMale + bcNonMale >= backCourtCapacity) {
                break
            }
            if (bcMale + bcNonMale + unit.size > backCourtCapacity) {
                continue
            }
            const unitMale = unit.maleCount
            const unitNonMale = unit.nonMaleCount
            if (
                bcMale + unitMale <= backMaleTarget &&
                bcNonMale + unitNonMale <= backNonMaleTarget
            ) {
                backCourtUnits.push(unit)
                bcMale += unitMale
                bcNonMale += unitNonMale
            }
        }

        // Relax gender constraints if back court is not full
        if (bcMale + bcNonMale < backCourtCapacity) {
            const selectedIds = new Set(backCourtUnits.map((u) => u.id))
            for (const unit of eligibleUnits) {
                if (selectedIds.has(unit.id)) {
                    continue
                }
                if (bcMale + bcNonMale + unit.size > backCourtCapacity) {
                    continue
                }
                backCourtUnits.push(unit)
                bcMale += unit.maleCount
                bcNonMale += unit.nonMaleCount
                if (bcMale + bcNonMale >= backCourtCapacity) {
                    break
                }
            }
        }

        // Assign back court units to teams 5 and 6 via snake order
        backCourtUnits.sort((a, b) => a.averageScore - b.averageScore)
        const backSnake = getSnakeOrder(backCourtUnits.length, 2)

        for (let i = 0; i < backCourtUnits.length; i++) {
            const unit = backCourtUnits[i]
            const teamIndex = BACK_START + backSnake[i]

            for (const player of unit.players) {
                teams[teamIndex].players.push(player)
                teams[teamIndex].scoreSum += player.placementScore
                if (player.male === true) {
                    teams[teamIndex].maleCount += 1
                } else {
                    teams[teamIndex].nonMaleCount += 1
                }
                if (player.isNew) {
                    teams[teamIndex].newCount += 1
                }
                preAssignedEntryIds.add(player.entryId)
            }
        }
    }

    const captains = divisionPlayers
        .filter((player) => player.isCaptain)
        .sort((a, b) => a.placementScore - b.placementScore)

    const captainTeamLimit = isTopDivision
        ? Math.min(teamCount - 2, teamCount)
        : teamCount
    const assignedCaptainIds = new Set<string>()
    for (let i = 0; i < captains.length && i < captainTeamLimit; i++) {
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

    const remaining = divisionPlayers.filter(
        (player) =>
            !assignedCaptainIds.has(player.entryId) &&
            !preAssignedEntryIds.has(player.entryId)
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

                const targetTeam = teams[teamIndex]
                const targetCandidates = targetTeam.players
                    .map((player, playerIndex) => ({ player, playerIndex }))
                    .filter(
                        ({ player }) =>
                            !player.isCaptain &&
                            !player.pairEntryId &&
                            player.assignmentUserId !== assignmentUserId
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
            const fallbackIndex = teams
                .map((entry, index) => ({
                    index,
                    remaining: teamCapacities[index] - entry.players.length,
                    duplicatePenalty: getDuplicatePlacementPenalty(
                        unit.players,
                        index
                    )
                }))
                .filter((entry) => entry.remaining >= unit.size)
                .sort((a, b) => {
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
                    !player.pairEntryId
            )

        const targetCandidates = targetTeam.players
            .map((player, index) => ({ player, index }))
            .filter(
                ({ player }) =>
                    player.male === true &&
                    !player.isCaptain &&
                    !player.pairEntryId
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
        const balanceSlice = isTopDivision
            ? teams.slice(0, teamCount - 2)
            : teams
        const surpluses = balanceSlice
            .map((team, index) => ({
                index,
                delta: team.nonMaleCount - teamNonMaleTargets[index]
            }))
            .filter((entry) => entry.delta > 0)
            .sort((a, b) => b.delta - a.delta)

        const deficits = balanceSlice
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
        const newBalanceSlice = isTopDivision
            ? teams.slice(0, teamCount - 2)
            : teams
        const surpluses = newBalanceSlice
            .map((team, index) => ({
                index,
                delta: team.newCount - teamNewTargets[index]
            }))
            .filter((entry) => entry.delta > 0)
            .sort((a, b) => b.delta - a.delta)

        const deficits = newBalanceSlice
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

    const trySwapScoreBalance = (
        highIndex: number,
        lowIndex: number,
        subset?: number[]
    ) => {
        const highTeam = teams[highIndex]
        const lowTeam = teams[lowIndex]

        if (highTeam.scoreSum <= lowTeam.scoreSum) {
            return false
        }

        const highCandidates = highTeam.players
            .map((player, index) => ({ player, index }))
            .filter(({ player }) => !player.isCaptain && !player.pairEntryId)

        const lowCandidates = lowTeam.players
            .map((player, index) => ({ player, index }))
            .filter(({ player }) => !player.isCaptain && !player.pairEntryId)

        if (highCandidates.length === 0 || lowCandidates.length === 0) {
            return false
        }

        const scoreIndices = subset ?? teams.map((_team, index) => index)

        const currentSpread =
            Math.max(...scoreIndices.map((i) => teams[i].scoreSum)) -
            Math.min(...scoreIndices.map((i) => teams[i].scoreSum))

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

                const projectedSums = scoreIndices.map((i) => {
                    if (i === highIndex) {
                        return highProjected
                    }
                    if (i === lowIndex) {
                        return lowProjected
                    }
                    return teams[i].scoreSum
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

    // For top division: balance passes stay within each group (front/back court).
    // For other divisions: balance all teams together.
    const frontIndices = isTopDivision
        ? Array.from({ length: teamCount - 2 }, (_, i) => i)
        : Array.from({ length: teamCount }, (_, i) => i)
    const backIndices = isTopDivision ? [teamCount - 2, teamCount - 1] : null

    for (let pass = 0; pass < 24; pass++) {
        const orderedByScore = frontIndices
            .map((index) => ({ index, scoreSum: teams[index].scoreSum }))
            .sort((a, b) => b.scoreSum - a.scoreSum)

        const high = orderedByScore[0]
        const low = orderedByScore[orderedByScore.length - 1]

        if (!high || !low || high.scoreSum <= low.scoreSum) {
            break
        }

        const changed = trySwapScoreBalance(high.index, low.index, frontIndices)
        if (!changed) {
            break
        }
    }

    // Score balance within back court (teams 5–6) for top division
    if (backIndices) {
        for (let pass = 0; pass < 8; pass++) {
            const orderedByScore = backIndices
                .map((index) => ({ index, scoreSum: teams[index].scoreSum }))
                .sort((a, b) => b.scoreSum - a.scoreSum)

            const high = orderedByScore[0]
            const low = orderedByScore[orderedByScore.length - 1]

            if (!high || !low || high.scoreSum <= low.scoreSum) {
                break
            }

            const changed = trySwapScoreBalance(
                high.index,
                low.index,
                backIndices
            )
            if (!changed) {
                break
            }
        }

        // Gender balance within back court (teams 5–6)
        const backTeamNonMaleTargetsMap: Record<number, number> = {
            [backIndices[0]]: backTeam4NonMaleTarget,
            [backIndices[1]]: backTeam5NonMaleTarget
        }
        for (let pass = 0; pass < 10; pass++) {
            const surpluses = backIndices
                .map((i) => ({
                    index: i,
                    delta: teams[i].nonMaleCount - backTeamNonMaleTargetsMap[i]
                }))
                .filter((e) => e.delta > 0)
                .sort((a, b) => b.delta - a.delta)
            const deficits = backIndices
                .map((i) => ({
                    index: i,
                    delta: teams[i].nonMaleCount - backTeamNonMaleTargetsMap[i]
                }))
                .filter((e) => e.delta < 0)
                .sort((a, b) => a.delta - b.delta)
            if (surpluses.length === 0 || deficits.length === 0) {
                break
            }
            let bcGenderChanged = false
            for (const source of surpluses) {
                for (const target of deficits) {
                    if (trySwapGender(source.index, target.index)) {
                        bcGenderChanged = true
                        break
                    }
                }
                if (bcGenderChanged) {
                    break
                }
            }
            if (!bcGenderChanged) {
                break
            }
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

export function CreateWeek3Form({
    seasonLabel,
    divisions,
    candidates,
    excludedPlayers,
    playerPicUrl
}: CreateWeek3FormProps) {
    const [step, setStep] = useState<1 | 2>(1)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const modal = usePlayerDetailModal()

    const aaDivision = divisions[0] ?? null
    const aaCaptains = useMemo(
        () =>
            candidates
                .filter(
                    (c) =>
                        c.isCaptain &&
                        aaDivision !== null &&
                        c.captainDivisionId === aaDivision.id
                )
                .sort((a, b) =>
                    getDisplayName(a)
                        .toLowerCase()
                        .localeCompare(getDisplayName(b).toLowerCase())
                ),
        [candidates, aaDivision]
    )

    const [includedAaCaptainIds, setIncludedAaCaptainIds] = useState<
        Set<string>
    >(new Set())

    const toggleAaCaptain = (userId: string) => {
        setIncludedAaCaptainIds((prev) => {
            const next = new Set(prev)
            if (next.has(userId)) {
                next.delete(userId)
            } else {
                next.add(userId)
            }
            return next
        })
    }

    const effectiveCandidates = useMemo(
        () =>
            candidates.filter(
                (c) =>
                    !c.isCaptain ||
                    aaDivision === null ||
                    c.captainDivisionId !== aaDivision.id ||
                    includedAaCaptainIds.has(c.userId)
            ),
        [candidates, aaDivision, includedAaCaptainIds]
    )

    const eligibleMaleCount = useMemo(
        () =>
            effectiveCandidates.filter((candidate) => candidate.male === true)
                .length,
        [effectiveCandidates]
    )
    const eligibleNonMaleCount = useMemo(
        () => effectiveCandidates.length - eligibleMaleCount,
        [effectiveCandidates.length, eligibleMaleCount]
    )

    const placementResult = useMemo(
        () => buildDivisionPlacement(divisions, effectiveCandidates),
        [divisions, effectiveCandidates]
    )
    const placement = placementResult.placement
    const playerPlacementReasonById = placementResult.reasonByUser
    const lockedPlayerIds = placementResult.lockedUserIds
    const duplicateCounterRef = useRef(0)

    const initialDivisionPlayers = useMemo(() => {
        const result = new Map<number, Week3PlacedPlayer[]>()

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

    const divisionNameById = useMemo(
        () =>
            new Map(divisions.map((division) => [division.id, division.name])),
        [divisions]
    )

    const getPlayerPlacementLabel = (
        player: Week3PlacedPlayer,
        reason: PlacementReason
    ) => {
        if (reason === "tryout2_same_division") {
            const week2DivisionName =
                player.week2DivisionId !== null
                    ? (divisionNameById.get(player.week2DivisionId) ?? null)
                    : null
            return week2DivisionName
                ? `Played in ${week2DivisionName} week 2`
                : "Played in week 2"
        }

        if (reason === "forced_move_up" || reason === "forced_move_down") {
            const week2DivisionName =
                player.week2DivisionId !== null
                    ? (divisionNameById.get(player.week2DivisionId) ?? null)
                    : null
            if (week2DivisionName) {
                return `${placementReasonLabel[reason]} from ${week2DivisionName}`
            }
        }

        return placementReasonLabel[reason]
    }

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

        if (lockedPlayerIds.has(selectedPlayer.sourceUserId)) {
            setError("Locked players cannot be moved between divisions.")
            return
        }

        const movingPlayers: Week3PlacedPlayer[] = [selectedPlayer]

        if (selectedPlayer.pairUserId) {
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
            if (lockedPlayerIds.has(partner.sourceUserId)) {
                setError("Locked players cannot be moved between divisions.")
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

        if (lockedPlayerIds.has(selectedPlayer.sourceUserId)) {
            setError("Locked players cannot be duplicated.")
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
        const getDistance = (division: Week3Division) =>
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

        const duplicate: Week3PlacedPlayer = {
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

        const playersById = new Map<string, Week3Candidate>()
        for (const players of editableDivisionPlayers.values()) {
            for (const player of players) {
                playersById.set(player.userId, player)
            }
        }

        const seen = new Set<string>()

        for (const player of playersById.values()) {
            if (!player.pairUserId) {
                continue
            }

            const partner = playersById.get(player.pairUserId)
            if (!partner || partner.pairUserId !== player.userId) {
                continue
            }

            const key =
                player.userId < partner.userId
                    ? `${player.userId}:${partner.userId}`
                    : `${partner.userId}:${player.userId}`

            if (seen.has(key)) {
                continue
            }

            seen.add(key)
            const average = (player.placementScore + partner.placementScore) / 2
            result.set(player.userId, average)
            result.set(partner.userId, average)
        }

        return result
    }, [editableDivisionPlayers])

    const teamAssignments = useMemo(() => {
        return divisions.map((division) => ({
            division,
            teams: buildTeamsForDivision(
                division,
                editableDivisionPlayers.get(division.id) || [],
                division.index === 0 && division.teamCount === 6
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

    const savePayload = useMemo<Week3SavedAssignment[]>(() => {
        const payload: Week3SavedAssignment[] = []

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

        const result = await saveWeek3Rosters(savePayload)

        if (result.status) {
            setMessage(result.message)
        } else {
            setError(result.message)
        }

        setIsSaving(false)
    }

    return (
        <div className="space-y-6">
            {aaDivision && aaCaptains.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            AA Captains — Week 3 Participation
                        </CardTitle>
                        <p className="text-muted-foreground text-sm">
                            Check each AA captain who is participating in Week
                            3. Unchecked captains will not appear in any
                            division.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-2">
                            {aaCaptains.map((captain) => (
                                <label
                                    key={captain.userId}
                                    className="flex cursor-pointer items-center gap-2"
                                >
                                    <Checkbox
                                        checked={includedAaCaptainIds.has(
                                            captain.userId
                                        )}
                                        onCheckedChange={() =>
                                            toggleAaCaptain(captain.userId)
                                        }
                                    />
                                    <span className="text-sm">
                                        {getDisplayName(captain)}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
            <Card>
                <CardHeader>
                    <CardTitle>
                        Season: {seasonLabel} | Eligible Players:{" "}
                        {effectiveCandidates.length} ({eligibleMaleCount} male /{" "}
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
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Week 3 Placement Legend</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                {placementReasonOrder.map((reason) => (
                                    <span
                                        key={reason}
                                        className={cn(
                                            "inline-flex items-center rounded-sm border px-2 py-1 font-medium text-xs",
                                            placementReasonClasses[reason]
                                        )}
                                    >
                                        {placementReasonLabel[reason]}
                                    </span>
                                ))}
                            </div>
                            <p className="text-muted-foreground text-xs">
                                Only captains and their paired partners are
                                locked for Week 3.
                            </p>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 xl:grid-cols-2">
                        {divisions.map((division, index) => {
                            const bucket = placement.get(division.id)
                            const players =
                                editableDivisionPlayers.get(division.id) || []
                            const targetLabel = "Week 3 ideal target"
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
                                            {players.map((player) => {
                                                const reason =
                                                    playerPlacementReasonById.get(
                                                        player.sourceUserId
                                                    ) ?? "score_based"
                                                const isLocked =
                                                    lockedPlayerIds.has(
                                                        player.sourceUserId
                                                    )
                                                const duplicateCount =
                                                    duplicateCountBySourceUserId.get(
                                                        player.sourceUserId
                                                    ) ?? 1
                                                const reasonLabel =
                                                    getPlayerPlacementLabel(
                                                        player,
                                                        reason
                                                    )

                                                return (
                                                    <div
                                                        key={player.entryId}
                                                        className={cn(
                                                            "flex items-center justify-between rounded-sm border px-2 py-0.5 text-xs",
                                                            placementReasonClasses[
                                                                reason
                                                            ]
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
                                                                {getDisplayName(
                                                                    player
                                                                )}
                                                            </button>
                                                            {player.seasonsPlayedCount ===
                                                                0 && (
                                                                <span className="ml-2 font-semibold text-green-600 dark:text-green-400">
                                                                    NEW
                                                                </span>
                                                            )}
                                                            {player.pairWithName && (
                                                                <span className="ml-2 opacity-80">
                                                                    pair:{" "}
                                                                    {
                                                                        player.pairWithName
                                                                    }
                                                                </span>
                                                            )}
                                                            <span className="ml-2 font-semibold">
                                                                {reasonLabel}
                                                            </span>
                                                            {duplicateCount >
                                                                1 && (
                                                                <span className="ml-2 font-semibold">
                                                                    plays twice
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="ml-2 flex items-center gap-1">
                                                            <span className="opacity-80">
                                                                {Math.round(
                                                                    player.placementScore
                                                                )}
                                                                {player.overallMostRecent !==
                                                                    null &&
                                                                    player.ratingScore !==
                                                                        null && (
                                                                        <span className="ml-1 text-amber-600 dark:text-amber-400">
                                                                            R
                                                                            {Math.round(
                                                                                player.ratingScore
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                {pairAverageScoreByUser.has(
                                                                    player.sourceUserId
                                                                ) && (
                                                                    <span>
                                                                        {" "}
                                                                        (pair
                                                                        avg{" "}
                                                                        {Math.round(
                                                                            pairAverageScoreByUser.get(
                                                                                player.sourceUserId
                                                                            ) ||
                                                                                0
                                                                        )}
                                                                        )
                                                                    </span>
                                                                )}{" "}
                                                                |{" "}
                                                                {player.male ===
                                                                true
                                                                    ? "M"
                                                                    : "NM"}
                                                            </span>
                                                            {player.recommendationUpCount >
                                                                0 && (
                                                                <span className="font-semibold text-green-700 dark:text-green-300">
                                                                    ↑{" "}
                                                                    {
                                                                        player.recommendationUpCount
                                                                    }
                                                                </span>
                                                            )}
                                                            {player.recommendationDownCount >
                                                                0 && (
                                                                <span className="font-semibold text-red-700 dark:text-red-300">
                                                                    ↓{" "}
                                                                    {
                                                                        player.recommendationDownCount
                                                                    }
                                                                </span>
                                                            )}
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
                                                                    index ===
                                                                        0 ||
                                                                    isLocked
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
                                                                    isLocked
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
                                                                    isLocked ||
                                                                    duplicateCount >=
                                                                        2 ||
                                                                    (index ===
                                                                        0 &&
                                                                        divisions.length ===
                                                                            1)
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
                                                )
                                            })}
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
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
                                                            <button
                                                                type="button"
                                                                className="font-medium underline-offset-2 hover:underline"
                                                                onClick={() =>
                                                                    modal.openPlayerDetail(
                                                                        player.assignmentUserId
                                                                    )
                                                                }
                                                            >
                                                                {
                                                                    player.displayName
                                                                }
                                                            </button>
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
                                                                <span className="ml-2 font-semibold text-green-600 dark:text-green-400">
                                                                    NEW
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
                                                            {player.ratingScore !==
                                                                null && (
                                                                <span className="ml-1 text-amber-600 dark:text-amber-400">
                                                                    R
                                                                    {Math.round(
                                                                        player.ratingScore
                                                                    )}
                                                                </span>
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
                            {isSaving ? "Saving..." : "Save Week 3 Rosters"}
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
                            Excluded (missing tryout 3 date):{" "}
                            {excludedPlayers.length}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {excludedPlayers.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No players were excluded for missing the tryout
                                3 date.
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
