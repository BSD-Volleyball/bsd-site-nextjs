// Pure placement logic for the week-1 roster builder.
// Extracted verbatim from create-week-1-form.tsx so the
// algorithms are separate from the UI (and unit-testable).

import type { Week1Candidate, Week1RosterAssignment } from "./week1-types"

export interface CandidateWithIndex extends Week1Candidate {
    sourceIndex: number
}

export interface AssignmentView {
    userId: string
    displayName: string
    male: boolean | null
    placementScore: number
    isNew: boolean
    pairWith: string | null
    pairAverageScore: number | null
    sessionNumber: 1 | 2
    courtNumber: 1 | 2 | 3 | 4
}

export interface CourtAlternates {
    courtNumber: 1 | 2 | 3 | 4
    players: CandidateWithIndex[]
}

export interface PlacementUnit {
    players: Week1Candidate[]
    size: number
    placementScore: number
    scoreSum: number
    maleCount: number
    nonMaleCount: number
    newMaleCount: number
    newNonMaleCount: number
    scoreBuckets: Array<{ score: number; count: number }>
}

export const CUTOFF_COUNT = 96

export function displayName(player: Week1Candidate | AssignmentView) {
    if ("firstName" in player) {
        if (player.preferredName) {
            return `${player.preferredName} ${player.lastName}`
        }
        return `${player.firstName} ${player.lastName}`
    }
    return player.displayName
}

export function cleanGroupLabel(label: string) {
    return label.replace(/^\d+\)\s*/, "")
}

export function reorder<T>(
    items: T[],
    fromIndex: number,
    toIndex: number
): T[] {
    if (fromIndex === toIndex) {
        return items
    }

    const updated = [...items]
    const [moved] = updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, moved)
    return updated
}

export function buildPairCandidates(ranked: Week1Candidate[]) {
    const playerById = new Map(ranked.map((player) => [player.userId, player]))
    const reciprocalPairs: Array<[Week1Candidate, Week1Candidate]> = []
    const oneWayPairs: Array<[Week1Candidate, Week1Candidate]> = []
    const seenReciprocal = new Set<string>()
    const seenOneWay = new Set<string>()

    for (const player of ranked) {
        if (!player.pairUserId) {
            continue
        }

        const partner = playerById.get(player.pairUserId)
        if (!partner || partner.userId === player.userId) {
            continue
        }

        const key =
            player.userId < partner.userId
                ? `${player.userId}:${partner.userId}`
                : `${partner.userId}:${player.userId}`

        if (partner.pairUserId === player.userId) {
            if (!seenReciprocal.has(key)) {
                reciprocalPairs.push([player, partner])
                seenReciprocal.add(key)
            }
            continue
        }

        const directionalKey = `${player.userId}:${partner.userId}`
        if (!seenOneWay.has(directionalKey)) {
            oneWayPairs.push([player, partner])
            seenOneWay.add(directionalKey)
        }
    }

    return [...reciprocalPairs, ...oneWayPairs]
}

export function buildPairInfoMap(selectedPlayers: Week1Candidate[]) {
    const used = new Set<string>()
    const pairInfo = new Map<
        string,
        { partnerName: string; averageScore: number }
    >()

    for (const [player, partner] of buildPairCandidates(selectedPlayers)) {
        if (used.has(player.userId) || used.has(partner.userId)) {
            continue
        }

        const averageScore =
            (player.placementScore + partner.placementScore) / 2
        pairInfo.set(player.userId, {
            partnerName: displayName(partner),
            averageScore
        })
        pairInfo.set(partner.userId, {
            partnerName: displayName(player),
            averageScore
        })
        used.add(player.userId)
        used.add(partner.userId)
    }

    return pairInfo
}

export function buildAssignments(selectedPlayers: Week1Candidate[]): {
    assignments: Week1RosterAssignment[]
    pairInfo: Map<string, { partnerName: string; averageScore: number }>
} {
    const ranked = [...selectedPlayers].sort((a, b) => {
        if (a.placementScore !== b.placementScore) {
            return a.placementScore - b.placementScore
        }
        return displayName(a)
            .toLowerCase()
            .localeCompare(displayName(b).toLowerCase())
    })

    const used = new Set<string>()
    const units: PlacementUnit[] = []

    function createUnit(players: Week1Candidate[]): PlacementUnit {
        const size = players.length
        const scoreSum = players.reduce(
            (sum, player) => sum + player.placementScore,
            0
        )
        const placementScore = scoreSum / size
        const maleCount = players.filter(
            (player) => player.male === true
        ).length
        const nonMaleCount = size - maleCount
        const newMaleCount = players.filter(
            (player) =>
                player.male === true && player.overallMostRecent === null
        ).length
        const newNonMaleCount = players.filter(
            (player) =>
                player.male !== true && player.overallMostRecent === null
        ).length
        const scoreMap = new Map<number, number>()
        for (const player of players) {
            scoreMap.set(
                player.placementScore,
                (scoreMap.get(player.placementScore) || 0) + 1
            )
        }
        return {
            players,
            size,
            placementScore,
            scoreSum,
            maleCount,
            nonMaleCount,
            newMaleCount,
            newNonMaleCount,
            scoreBuckets: [...scoreMap.entries()].map(([score, count]) => ({
                score,
                count
            }))
        }
    }

    for (const [player, partner] of buildPairCandidates(ranked)) {
        if (used.has(player.userId) || used.has(partner.userId)) {
            continue
        }

        units.push(createUnit([player, partner]))
        used.add(player.userId)
        used.add(partner.userId)
    }

    for (const player of ranked) {
        if (used.has(player.userId)) {
            continue
        }
        units.push(createUnit([player]))
        used.add(player.userId)
    }

    units.sort((a, b) => {
        if (a.placementScore !== b.placementScore) {
            return a.placementScore - b.placementScore
        }
        return displayName(a.players[0]).localeCompare(
            displayName(b.players[0])
        )
    })

    function splitUnitsIntoCourts(
        unitList: PlacementUnit[]
    ): PlacementUnit[][] | null {
        function search(
            startIndex: number,
            courtIndex: number
        ): number[] | null {
            if (courtIndex === 3) {
                const remainingSlots = unitList
                    .slice(startIndex)
                    .reduce((sum, unit) => sum + unit.size, 0)
                return remainingSlots === 24 ? [unitList.length] : null
            }

            let slots = 0
            for (let i = startIndex; i < unitList.length; i++) {
                slots += unitList[i].size
                if (slots > 24) {
                    break
                }
                if (slots === 24) {
                    const next = search(i + 1, courtIndex + 1)
                    if (next) {
                        return [i + 1, ...next]
                    }
                }
            }
            return null
        }

        const cuts = search(0, 0)
        if (!cuts) {
            return null
        }

        const courts: PlacementUnit[][] = []
        let start = 0
        for (const cut of cuts) {
            courts.push(unitList.slice(start, cut))
            start = cut
        }
        return courts
    }

    const courtsByUnits =
        splitUnitsIntoCourts(units) ||
        (() => {
            const courts: PlacementUnit[][] = [[], [], [], []]
            let courtIndex = 0
            let slots = 0
            for (const unit of units) {
                if (courtIndex < 3 && slots + unit.size > 24) {
                    courtIndex += 1
                    slots = 0
                }
                courts[courtIndex].push(unit)
                slots += unit.size
            }
            return courts
        })()

    const assignments: Week1RosterAssignment[] = []
    const pairInfo = buildPairInfoMap(selectedPlayers)

    for (let index = 0; index < 4; index++) {
        const courtUnits = courtsByUnits[index]
        const courtNumber = (index + 1) as 1 | 2 | 3 | 4

        const courtTotals = courtUnits.reduce(
            (acc, unit) => ({
                size: acc.size + unit.size,
                scoreSum: acc.scoreSum + unit.scoreSum,
                male: acc.male + unit.maleCount,
                nonMale: acc.nonMale + unit.nonMaleCount,
                newMale: acc.newMale + unit.newMaleCount,
                newNonMale: acc.newNonMale + unit.newNonMaleCount
            }),
            {
                size: 0,
                scoreSum: 0,
                male: 0,
                nonMale: 0,
                newMale: 0,
                newNonMale: 0
            }
        )

        const sessionTargets = {
            one: {
                size: 12,
                scoreSum: courtTotals.scoreSum / 2,
                male: Math.ceil(courtTotals.male / 2),
                nonMale: 12 - Math.ceil(courtTotals.male / 2)
            },
            two: {
                size: 12,
                scoreSum: courtTotals.scoreSum - courtTotals.scoreSum / 2,
                male: courtTotals.male - Math.ceil(courtTotals.male / 2),
                nonMale:
                    courtTotals.nonMale - (12 - Math.ceil(courtTotals.male / 2))
            }
        }

        const sessionNewTargets = {
            one: {
                male:
                    courtTotals.male > 0
                        ? Math.round(
                              (courtTotals.newMale * sessionTargets.one.male) /
                                  courtTotals.male
                          )
                        : 0,
                nonMale:
                    courtTotals.nonMale > 0
                        ? Math.round(
                              (courtTotals.newNonMale *
                                  sessionTargets.one.nonMale) /
                                  courtTotals.nonMale
                          )
                        : 0
            }
        }
        const sessionTwoNewTargets = {
            male: courtTotals.newMale - sessionNewTargets.one.male,
            nonMale: courtTotals.newNonMale - sessionNewTargets.one.nonMale
        }

        const scoreBucketTotals = new Map<number, number>()
        for (const unit of courtUnits) {
            for (const bucket of unit.scoreBuckets) {
                scoreBucketTotals.set(
                    bucket.score,
                    (scoreBucketTotals.get(bucket.score) || 0) + bucket.count
                )
            }
        }

        const sortedCourtUnits = [...courtUnits].sort((a, b) => {
            if (a.placementScore !== b.placementScore) {
                return a.placementScore - b.placementScore
            }
            return displayName(a.players[0]).localeCompare(
                displayName(b.players[0])
            )
        })

        const remainingSizeFromIndex = Array(sortedCourtUnits.length + 1).fill(
            0
        )
        for (let i = sortedCourtUnits.length - 1; i >= 0; i--) {
            remainingSizeFromIndex[i] =
                remainingSizeFromIndex[i + 1] + sortedCourtUnits[i].size
        }

        const initialStats = {
            size: 0,
            scoreSum: 0,
            male: 0,
            nonMale: 0,
            newMale: 0,
            newNonMale: 0,
            scoreBuckets: new Map<number, number>()
        }

        type ScoreTuple = readonly [number, number, number, number, number]
        let bestTuple: ScoreTuple | null = null
        let bestPicked = new Set<number>()
        const picked = new Set<number>()

        const compareTuple = (a: ScoreTuple, b: ScoreTuple) => {
            for (let i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) {
                    return a[i] - b[i]
                }
            }
            return 0
        }

        const scoreTuple = (stats: typeof initialStats) => {
            const sessionOne = stats
            const sessionTwo = {
                size: courtTotals.size - sessionOne.size,
                scoreSum: courtTotals.scoreSum - sessionOne.scoreSum,
                male: courtTotals.male - sessionOne.male,
                nonMale: courtTotals.nonMale - sessionOne.nonMale,
                newMale: courtTotals.newMale - sessionOne.newMale,
                newNonMale: courtTotals.newNonMale - sessionOne.newNonMale,
                scoreBuckets: new Map<number, number>()
            }

            for (const [score, total] of scoreBucketTotals.entries()) {
                const oneCount = sessionOne.scoreBuckets.get(score) || 0
                sessionTwo.scoreBuckets.set(score, total - oneCount)
            }

            const primary =
                Math.abs(sessionOne.male - sessionTargets.one.male) +
                Math.abs(sessionTwo.male - sessionTargets.two.male) +
                Math.abs(sessionOne.nonMale - sessionTargets.one.nonMale) +
                Math.abs(sessionTwo.nonMale - sessionTargets.two.nonMale)

            const secondary =
                Math.abs(sessionOne.newMale - sessionNewTargets.one.male) +
                Math.abs(sessionTwo.newMale - sessionTwoNewTargets.male) +
                Math.abs(
                    sessionOne.newNonMale - sessionNewTargets.one.nonMale
                ) +
                Math.abs(sessionTwo.newNonMale - sessionTwoNewTargets.nonMale)

            let tertiary = 0
            for (const [score, total] of scoreBucketTotals.entries()) {
                const oneCount = sessionOne.scoreBuckets.get(score) || 0
                const targetOne = Math.ceil(total / 2)
                tertiary += Math.abs(oneCount - targetOne)
            }

            const quaternary = Math.abs(
                sessionOne.scoreSum - sessionTargets.one.scoreSum
            )

            const quinary = Math.abs(sessionOne.size - sessionTargets.one.size)

            return [primary, secondary, tertiary, quaternary, quinary] as const
        }

        const search = (index: number, stats: typeof initialStats) => {
            if (stats.size > sessionTargets.one.size) {
                return
            }
            if (
                stats.size + remainingSizeFromIndex[index] <
                sessionTargets.one.size
            ) {
                return
            }

            if (index === sortedCourtUnits.length) {
                if (stats.size !== sessionTargets.one.size) {
                    return
                }
                const tuple = scoreTuple(stats)
                if (!bestTuple || compareTuple(tuple, bestTuple) < 0) {
                    bestTuple = tuple
                    bestPicked = new Set(picked)
                }
                return
            }

            search(index + 1, stats)

            const unit = sortedCourtUnits[index]
            picked.add(index)
            const nextScoreBuckets = new Map(stats.scoreBuckets)
            for (const bucket of unit.scoreBuckets) {
                nextScoreBuckets.set(
                    bucket.score,
                    (nextScoreBuckets.get(bucket.score) || 0) + bucket.count
                )
            }
            search(index + 1, {
                size: stats.size + unit.size,
                scoreSum: stats.scoreSum + unit.scoreSum,
                male: stats.male + unit.maleCount,
                nonMale: stats.nonMale + unit.nonMaleCount,
                newMale: stats.newMale + unit.newMaleCount,
                newNonMale: stats.newNonMale + unit.newNonMaleCount,
                scoreBuckets: nextScoreBuckets
            })
            picked.delete(index)
        }

        search(0, initialStats)

        const sessionOnePlayers: Week1Candidate[] = []
        const sessionTwoPlayers: Week1Candidate[] = []

        for (let i = 0; i < sortedCourtUnits.length; i++) {
            const destination = bestPicked.has(i)
                ? sessionOnePlayers
                : sessionTwoPlayers
            destination.push(...sortedCourtUnits[i].players)
        }

        for (const player of sessionOnePlayers) {
            assignments.push({
                userId: player.userId,
                sessionNumber: 1,
                courtNumber
            })
        }

        for (const player of sessionTwoPlayers) {
            assignments.push({
                userId: player.userId,
                sessionNumber: 2,
                courtNumber
            })
        }
    }

    return { assignments, pairInfo }
}
