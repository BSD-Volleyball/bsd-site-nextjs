// Team building shared by the week-2 and week-3 roster builders: captain
// seeding, snake-order unit distribution, and swap-based balance passes.
// Week-specific rules are injected via TeamBuildOptions:
// - newPlayersRequireCaptainedTeam (week 2): new players may only land on
//   teams that have a captain (coach divisions exempt).
// - backCourt (week 3): the top division's last N teams are pre-filled with
//   the most experienced returners before captains seed the front teams,
//   and balance passes stay within each court group.

import { splitByGender } from "@/lib/utils"
import { allocateByWeightWithCapacity, getSnakeOrder } from "./allocation"
import { getDisplayName } from "./units"
import { getTeamNumberSlot } from "./slots"
import type {
    PlacedPlayer,
    PreseasonCandidate,
    PreseasonDivision
} from "./types"

export interface BackCourtConfig {
    /** Division index the back-court split applies to (0 = top division). */
    divisionIndex: number
    /** The split only activates when the division has exactly this many teams. */
    requiredTeamCount: number
    /** How many trailing teams form the back court. */
    backTeamCount: number
}

export interface TeamBuildOptions {
    newPlayersRequireCaptainedTeam: boolean
    backCourt: BackCourtConfig | null
}

export interface TeamPlayer {
    entryId: string
    assignmentUserId: string
    displayName: string
    male: boolean | null
    placementScore: number
    ratingScore: number | null
    consecutiveSeasonsInTopDiv: number
    isCaptain: boolean
    isCoach: boolean
    coachDivisionName: string | null
    isNew: boolean
    pairEntryId: string | null
    pairName: string | null
    isDuplicateEntry: boolean
    /** Tryout slot request: 1-based slots the player can attend (null = any). */
    availableSlots: number[] | null
}

export interface TeamBucket {
    number: number
    players: TeamPlayer[]
    scoreSum: number
    maleCount: number
    nonMaleCount: number
    newCount: number
}

export interface TeamUnit {
    id: string
    players: TeamPlayer[]
    maleCount: number
    nonMaleCount: number
    newCount: number
    size: number
    averageScore: number
}

function compareTuples(a: readonly number[], b: readonly number[]) {
    for (let index = 0; index < a.length; index++) {
        if (a[index] !== b[index]) {
            return a[index] - b[index]
        }
    }
    return 0
}

/**
 * Entry ids of players whose tryout slot request is not satisfied by the
 * team they ended up on. Used by the create forms to flag violations.
 */
export function getSlotViolationEntryIds(teams: TeamBucket[]): Set<string> {
    const result = new Set<string>()
    for (const team of teams) {
        const slotNumber = getTeamNumberSlot(team.number)
        for (const player of team.players) {
            if (
                player.availableSlots !== null &&
                !player.availableSlots.includes(slotNumber)
            ) {
                result.add(player.entryId)
            }
        }
    }
    return result
}

export function buildTeamUnits(players: TeamPlayer[]): TeamUnit[] {
    const sorted = [...players].sort((a, b) => {
        if (a.placementScore !== b.placementScore) {
            return a.placementScore - b.placementScore
        }
        return a.displayName.localeCompare(b.displayName)
    })
    const byId = new Map(sorted.map((player) => [player.entryId, player]))
    const used = new Set<string>()
    const result: TeamUnit[] = []

    for (const player of sorted) {
        if (used.has(player.entryId)) {
            continue
        }

        const partner = player.pairEntryId ? byId.get(player.pairEntryId) : null
        const isMutualPair = !!partner && partner.pairEntryId === player.entryId
        const pairPlayers =
            isMutualPair && partner && !used.has(partner.entryId)
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

export function buildTeamsForDivision<C extends PreseasonCandidate>(
    division: PreseasonDivision,
    players: PlacedPlayer<C>[],
    options: TeamBuildOptions
): TeamBucket[] {
    const teamCount = division.teamCount

    const backCourtActive =
        options.backCourt !== null &&
        division.index === options.backCourt.divisionIndex &&
        teamCount === options.backCourt.requiredTeamCount
    const backTeamCount =
        backCourtActive && options.backCourt
            ? options.backCourt.backTeamCount
            : 0
    const backStart = teamCount - backTeamCount

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
        consecutiveSeasonsInTopDiv: player.consecutiveSeasonsInTopDiv ?? 0,
        // Coaches never arrive flagged as captains (the loader strips them);
        // this guard also keeps a regular-division captain who lands in the
        // coaches division from being seeded as its captain.
        isCaptain: division.usesCoaches ? false : player.isCaptain,
        isCoach: player.isCoach,
        coachDivisionName: player.coachDivisionName,
        isNew: player.overallMostRecent === null,
        pairEntryId: null,
        pairName: null,
        isDuplicateEntry: player.isDuplicateEntry,
        availableSlots: player.availableSlots ?? null
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

    // Tryout slot requests: slot = team-slot index + 1
    const getTeamSlotIndex = (teamIndex: number) => Math.floor(teamIndex / 2)

    const canAttendTeam = (
        availableSlots: number[] | null,
        teamIndex: number
    ) =>
        availableSlots === null ||
        availableSlots.includes(getTeamSlotIndex(teamIndex) + 1)

    const unitSlotViolationCount = (
        unitPlayers: TeamPlayer[],
        teamIndex: number
    ) =>
        unitPlayers.filter(
            (player) => !canAttendTeam(player.availableSlots, teamIndex)
        ).length

    // Intersection of two availability sets (null = unrestricted). An empty
    // intersection means the pair's requests conflict — treated unrestricted,
    // with the conflict surfaced in the UI.
    const intersectSlots = (a: number[] | null, b: number[] | null) => {
        if (a === null) {
            return b
        }
        if (b === null) {
            return a
        }
        const merged = a.filter((slot) => b.includes(slot))
        return merged.length > 0 ? merged : null
    }

    // Back court: pre-fill the trailing teams with the most experienced
    // non-captains before captains seed the front teams.
    const preAssignedEntryIds = new Set<string>()
    // Per-back-team non-male targets (populated below when the split is active)
    const backTeamNonMaleTargets = new Map<number, number>()

    if (backCourtActive && backTeamCount > 0) {
        const backCapacities = teamCapacities.slice(backStart)
        const backCourtCapacity = backCapacities.reduce(
            (sum, value) => sum + value,
            0
        )

        // Back-court teams follow the division's configured split, not the
        // gender mix of whoever landed in the division.
        const splitTeamSize = division.malePerTeam + division.nonMalePerTeam
        const nonMaleRatioForBack =
            splitTeamSize > 0 ? division.nonMalePerTeam / splitTeamSize : 0.5
        // Cap by the non-males the division actually has: the back court must
        // not reserve seats that the front teams would then be unable to fill.
        const backNonMaleTarget = Math.min(
            backCourtCapacity,
            splitByGender(players).nonMales.length,
            Math.round(backCourtCapacity * nonMaleRatioForBack)
        )
        const backMaleTarget = backCourtCapacity - backNonMaleTarget

        // Per-team non-male targets: round each team, the last takes the rest
        let assignedBackNonMale = 0
        for (let offset = 0; offset < backTeamCount; offset++) {
            const teamIndex = backStart + offset
            const target =
                offset === backTeamCount - 1
                    ? backNonMaleTarget - assignedBackNonMale
                    : Math.round(backCapacities[offset] * nonMaleRatioForBack)
            backTeamNonMaleTargets.set(teamIndex, target)
            assignedBackNonMale += target
        }

        // Build units from non-captains, excluding new players and players
        // paired with a captain or a new player (who must stay on the front teams).
        const captainEntryIds = new Set(
            divisionPlayers.filter((p) => p.isCaptain).map((p) => p.entryId)
        )
        const newPlayerEntryIds = new Set(
            divisionPlayers.filter((p) => p.isNew).map((p) => p.entryId)
        )
        // Slot requests: back-court teams play these slots (slot 3 for the
        // standard 6-team/2-back split)
        const backSlotNumbers = new Set(
            Array.from(
                { length: backTeamCount },
                (_, offset) => getTeamSlotIndex(backStart + offset) + 1
            )
        )
        const canUnitSitBackCourt = (unit: TeamUnit) =>
            unit.players.every(
                (p) =>
                    p.availableSlots === null ||
                    p.availableSlots.some((slot) => backSlotNumbers.has(slot))
            )
        // Units whose restricted members can ONLY play back-court slots must
        // be selected here — the back court fills before the main placement
        // loop, so penalty steering can never help them later.
        const unitNeedsBackCourt = (unit: TeamUnit) =>
            unit.players.some((p) => p.availableSlots !== null) &&
            unit.players.every(
                (p) =>
                    p.availableSlots === null ||
                    p.availableSlots.every((slot) => backSlotNumbers.has(slot))
            )

        const eligibleUnits = buildTeamUnits(
            divisionPlayers.filter(
                (p) =>
                    !p.isCaptain &&
                    !p.isNew &&
                    !(p.pairEntryId && captainEntryIds.has(p.pairEntryId)) &&
                    !(p.pairEntryId && newPlayerEntryIds.has(p.pairEntryId))
            )
        ).filter(canUnitSitBackCourt)
        eligibleUnits.sort((a, b) => {
            const aNeedsBack = unitNeedsBackCourt(a) ? 0 : 1
            const bNeedsBack = unitNeedsBackCourt(b) ? 0 : 1
            if (aNeedsBack !== bNeedsBack) {
                return aNeedsBack - bNeedsBack
            }
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
        const backCourtUnits: TeamUnit[] = []
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

        // Assign back court units to the trailing teams via snake order
        backCourtUnits.sort((a, b) => a.averageScore - b.averageScore)
        const backSnake = getSnakeOrder(backCourtUnits.length, backTeamCount)

        for (let i = 0; i < backCourtUnits.length; i++) {
            const unit = backCourtUnits[i]
            const teamIndex = backStart + backSnake[i]

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

    const captainTeamLimit = backCourtActive
        ? Math.min(teamCount - backTeamCount, teamCount)
        : teamCount

    // Captain-to-team assignment is a permutation: one captain per front
    // team is what matters, not which team. Captains with a slot request
    // (their own, intersected with a riding mutual partner's) claim an
    // allowed free team first — fewest options, then score order; everyone
    // else fills the remaining teams ascending in score order. With no
    // requests this reduces to the previous identity assignment.
    const seatedCaptains = captains.slice(0, captainTeamLimit)

    const captainAvailability = (captain: TeamPlayer) => {
        const partner = captain.pairEntryId
            ? (divisionPlayers.find(
                  (p) =>
                      p.entryId === captain.pairEntryId &&
                      p.pairEntryId === captain.entryId
              ) ?? null)
            : null
        return intersectSlots(
            captain.availableSlots,
            partner?.availableSlots ?? null
        )
    }

    const captainIndexByEntryId = new Map<string, number>()
    const freeCaptainIndices = Array.from(
        { length: captainTeamLimit },
        (_, index) => index
    )

    const restrictedCaptains = seatedCaptains
        .map((captain, order) => ({
            captain,
            order,
            availability: captainAvailability(captain)
        }))
        .filter(
            (entry): entry is typeof entry & { availability: number[] } =>
                entry.availability !== null
        )
        .sort((a, b) => {
            if (a.availability.length !== b.availability.length) {
                return a.availability.length - b.availability.length
            }
            return a.order - b.order
        })

    for (const entry of restrictedCaptains) {
        const allowedPosition = freeCaptainIndices.findIndex((teamIndex) =>
            canAttendTeam(entry.availability, teamIndex)
        )
        if (allowedPosition !== -1) {
            captainIndexByEntryId.set(
                entry.captain.entryId,
                freeCaptainIndices[allowedPosition]
            )
            freeCaptainIndices.splice(allowedPosition, 1)
        }
    }

    for (const captain of seatedCaptains) {
        if (captainIndexByEntryId.has(captain.entryId)) {
            continue
        }
        const teamIndex = freeCaptainIndices.shift()
        if (teamIndex === undefined) {
            break
        }
        captainIndexByEntryId.set(captain.entryId, teamIndex)
    }

    const assignedCaptainIds = new Set<string>()
    for (const captain of seatedCaptains) {
        const teamIndex = captainIndexByEntryId.get(captain.entryId)
        if (teamIndex === undefined) {
            continue
        }

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
            assignedCaptainIds.add(player.entryId)
        }
    }

    const teamsWithCaptain = new Set(captainIndexByEntryId.values())

    // Week-2 rule: new players may only land on captained teams
    // (coach divisions exempt).
    const canHostNewPlayers = (teamIndex: number) =>
        !options.newPlayersRequireCaptainedTeam ||
        division.usesCoaches ||
        teamsWithCaptain.has(teamIndex)

    const remaining = divisionPlayers.filter(
        (player) =>
            !assignedCaptainIds.has(player.entryId) &&
            !preAssignedEntryIds.has(player.entryId)
    )
    const units = buildTeamUnits(remaining)
    const snakeOrder = getSnakeOrder(units.length, teamCount)

    // Non-male targets drive team gender balance; male targets are the
    // remainder of each team's capacity. Every team in a division shares one
    // configured split (6-2 / 5-3 / 4-4), so an even spread of the division's
    // non-males IS the split — a division handed the 18 non-males a 6-team
    // 5-3 division asks for gives all six teams a target of 3. The split's
    // leverage is at the division level (`getDivisionTargets`), which decides
    // how many non-males each division receives in the first place.
    const totalNonMale = splitByGender(players).nonMales.length

    // Back-court teams were pre-filled above against their own targets, so
    // they keep those and the front teams share what is actually left.
    // Spreading the division total across all teams would double-count the
    // reserved seats and leave front teams chasing non-males that are gone.
    const backTargets = Array.from(
        { length: teamCount },
        (_entry, index) => backTeamNonMaleTargets.get(index) ?? 0
    )
    const reservedNonMale = backTargets.reduce((sum, value) => sum + value, 0)
    const frontTeamCount =
        backCourtActive && backTeamCount > 0 ? backStart : teamCount

    const frontNonMaleTargets = allocateByWeightWithCapacity(
        Math.max(0, totalNonMale - reservedNonMale),
        teamCapacities.slice(0, frontTeamCount),
        Array.from({ length: frontTeamCount }, () => 1)
    )
    const teamNonMaleTargets = teamCapacities.map((_capacity, index) =>
        index < frontTeamCount ? frontNonMaleTargets[index] : backTargets[index]
    )
    const teamMaleTargets = teamCapacities.map(
        (capacity, index) => capacity - teamNonMaleTargets[index]
    )
    const totalNew = divisionPlayers.filter((player) => player.isNew).length
    const teamNewTargets = allocateByWeightWithCapacity(
        totalNew,
        teamCapacities,
        teamCapacities.map(() => 1)
    )
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

                if (sourcePlayer.isNew && !canHostNewPlayers(teamIndex)) {
                    continue
                }

                if (!canAttendTeam(sourcePlayer.availableSlots, teamIndex)) {
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
                                player.isNew &&
                                !canHostNewPlayers(source.teamIndex)
                            ) &&
                            canAttendTeam(
                                player.availableSlots,
                                source.teamIndex
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
        let bestTuple: readonly number[] | null = null

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

            if (unit.newCount > 0 && !canHostNewPlayers(teamIndex)) {
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
            // Slot requests lead the tuple: honoring them outranks every
            // balance concern (but capacity/new-player gates above still win).
            const slotPenalty = unitSlotViolationCount(unit.players, teamIndex)

            const tuple: readonly number[] = [
                slotPenalty,
                constraintPenalty,
                duplicatePenalty,
                genderPenalty,
                newPenalty,
                spread,
                sizePenalty
            ]

            if (!bestTuple || compareTuples(tuple, bestTuple) < 0) {
                bestTuple = tuple
                bestTeamIndex = teamIndex
            }
        }

        if (!bestTuple) {
            const fallbackCandidates = teams
                .map((entry, index) => ({
                    index,
                    remaining: teamCapacities[index] - entry.players.length,
                    slotPenalty: unitSlotViolationCount(unit.players, index),
                    duplicatePenalty: getDuplicatePlacementPenalty(
                        unit.players,
                        index
                    ),
                    hasCaptain: teamsWithCaptain.has(index)
                }))
                .filter((entry) => entry.remaining >= unit.size)

            const preferCaptained =
                options.newPlayersRequireCaptainedTeam &&
                !division.usesCoaches &&
                unit.newCount > 0
                    ? fallbackCandidates.filter((entry) => entry.hasCaptain)
                    : []

            const pool =
                preferCaptained.length > 0
                    ? preferCaptained
                    : fallbackCandidates

            const fallbackIndex = pool.sort((a, b) => {
                if (a.slotPenalty !== b.slotPenalty) {
                    return a.slotPenalty - b.slotPenalty
                }
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

    // Slot-request repair: the greedy unit placement can strand a restricted
    // player on a disallowed team when their allowed teams filled up first.
    // Swap each violated player with a compatible player from an allowed
    // team (partner must be able to attend the violated player's team).
    // Every successful swap removes exactly one violation, so this
    // terminates; captains and pair members stay put (their violations
    // surface in the UI instead).
    for (let pass = 0; pass < 24; pass++) {
        let changed = false

        for (let teamIndex = 0; teamIndex < teams.length; teamIndex++) {
            const team = teams[teamIndex]

            for (
                let playerIndex = 0;
                playerIndex < team.players.length;
                playerIndex++
            ) {
                const player = team.players[playerIndex]
                if (player.isCaptain || player.pairEntryId) {
                    continue
                }
                if (canAttendTeam(player.availableSlots, teamIndex)) {
                    continue
                }

                let bestSwap: {
                    targetTeamIndex: number
                    targetPlayerIndex: number
                    mismatch: number
                    scoreDiff: number
                } | null = null

                for (
                    let targetIndex = 0;
                    targetIndex < teams.length;
                    targetIndex++
                ) {
                    if (targetIndex === teamIndex) {
                        continue
                    }
                    if (!canAttendTeam(player.availableSlots, targetIndex)) {
                        continue
                    }
                    if (player.isNew && !canHostNewPlayers(targetIndex)) {
                        continue
                    }

                    const targetTeam = teams[targetIndex]
                    for (
                        let candidateIndex = 0;
                        candidateIndex < targetTeam.players.length;
                        candidateIndex++
                    ) {
                        const swapCandidate = targetTeam.players[candidateIndex]
                        if (
                            swapCandidate.isCaptain ||
                            swapCandidate.pairEntryId
                        ) {
                            continue
                        }
                        if (
                            !canAttendTeam(
                                swapCandidate.availableSlots,
                                teamIndex
                            )
                        ) {
                            continue
                        }
                        if (
                            swapCandidate.isNew &&
                            !canHostNewPlayers(teamIndex)
                        ) {
                            continue
                        }

                        const mismatch =
                            Number(swapCandidate.male !== player.male) +
                            Number(swapCandidate.isNew !== player.isNew)
                        const scoreDiff = Math.abs(
                            swapCandidate.placementScore - player.placementScore
                        )

                        if (
                            !bestSwap ||
                            mismatch < bestSwap.mismatch ||
                            (mismatch === bestSwap.mismatch &&
                                scoreDiff < bestSwap.scoreDiff)
                        ) {
                            bestSwap = {
                                targetTeamIndex: targetIndex,
                                targetPlayerIndex: candidateIndex,
                                mismatch,
                                scoreDiff
                            }
                        }
                    }
                }

                if (bestSwap) {
                    const targetTeam = teams[bestSwap.targetTeamIndex]
                    const partner =
                        targetTeam.players[bestSwap.targetPlayerIndex]
                    team.players[playerIndex] = partner
                    targetTeam.players[bestSwap.targetPlayerIndex] = player
                    recomputeTeamStats(team)
                    recomputeTeamStats(targetTeam)
                    changed = true
                }
            }
        }

        if (!changed) {
            break
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
                    !(player.isNew && !canHostNewPlayers(targetIndex)) &&
                    canAttendTeam(player.availableSlots, targetIndex)
            )

        const targetCandidates = targetTeam.players
            .map((player, index) => ({ player, index }))
            .filter(
                ({ player }) =>
                    player.male === true &&
                    !player.isCaptain &&
                    !player.pairEntryId &&
                    !(player.isNew && !canHostNewPlayers(sourceIndex)) &&
                    canAttendTeam(player.availableSlots, sourceIndex)
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
        const balanceSlice = backCourtActive ? teams.slice(0, backStart) : teams
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
                    player.isNew &&
                    !player.isCaptain &&
                    !player.pairEntryId &&
                    canAttendTeam(player.availableSlots, targetIndex)
            )

        const targetCandidates = targetTeam.players
            .map((player, index) => ({ player, index }))
            .filter(
                ({ player }) =>
                    !player.isNew &&
                    !player.isCaptain &&
                    !player.pairEntryId &&
                    canAttendTeam(player.availableSlots, sourceIndex)
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
        const newBalanceSlice = backCourtActive
            ? teams.slice(0, backStart)
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
                if (!canHostNewPlayers(target.index)) {
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
            .filter(
                ({ player }) =>
                    !player.isCaptain &&
                    !player.pairEntryId &&
                    !(player.isNew && !canHostNewPlayers(lowIndex)) &&
                    canAttendTeam(player.availableSlots, lowIndex)
            )

        const lowCandidates = lowTeam.players
            .map((player, index) => ({ player, index }))
            .filter(
                ({ player }) =>
                    !player.isCaptain &&
                    !player.pairEntryId &&
                    !(player.isNew && !canHostNewPlayers(highIndex)) &&
                    canAttendTeam(player.availableSlots, highIndex)
            )

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

    // With the back-court split active, balance passes stay within each court
    // group; otherwise balance all teams together.
    const frontIndices = Array.from(
        { length: backCourtActive ? backStart : teamCount },
        (_, i) => i
    )
    const backIndices = backCourtActive
        ? Array.from({ length: backTeamCount }, (_, i) => backStart + i)
        : null

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

    // Score and gender balance within the back court
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

        for (let pass = 0; pass < 10; pass++) {
            const surpluses = backIndices
                .map((i) => ({
                    index: i,
                    delta:
                        teams[i].nonMaleCount -
                        (backTeamNonMaleTargets.get(i) ?? 0)
                }))
                .filter((e) => e.delta > 0)
                .sort((a, b) => b.delta - a.delta)
            const deficits = backIndices
                .map((i) => ({
                    index: i,
                    delta:
                        teams[i].nonMaleCount -
                        (backTeamNonMaleTargets.get(i) ?? 0)
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
