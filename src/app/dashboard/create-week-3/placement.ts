// Week-3 placement logic: continuity-driven division placement (week-2
// carry-forward, forced moves) plus team building with the top-division
// back-court split. Shared primitives (units, allocation) live in
// src/lib/preseason.

import { splitByGender } from "@/lib/utils"
import {
    addUnitToPlacement,
    buildPlacementUnits,
    compareCandidates,
    getDisplayName,
    removeUnitFromPlacement
} from "@/lib/preseason/units"
import {
    allocateByWeightWithCapacity,
    getDivisionTargets,
    getScoreBandLevel,
    getSnakeOrder
} from "@/lib/preseason/allocation"
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
export type { PlacementReason } from "@/lib/preseason/types"

export type Week3PlacedPlayer = PlacedPlayer<Week3Candidate>
export type PlacementUnit = PreseasonPlacementUnit<Week3Candidate>
export type DivisionPlacement = PreseasonDivisionPlacement<Week3Candidate>

export interface TeamPlayer {
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

export interface TeamBucket {
    number: number
    players: TeamPlayer[]
    scoreSum: number
    maleCount: number
    nonMaleCount: number
    newCount: number
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

export function buildTeamUnits(players: TeamPlayer[]): Array<{
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

        const { males, nonMales } = splitByGender(pairPlayers)
        const maleCount = males.length
        const nonMaleCount = nonMales.length
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

export function buildTeamsForDivision(
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

        const totalMaleForBack = splitByGender(players).males.length
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

    const totalMale = splitByGender(players).males.length
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
        const { males, nonMales } = splitByGender(team.players)
        team.maleCount = males.length
        team.nonMaleCount = nonMales.length
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
