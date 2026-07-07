import { describe, expect, it } from "vitest"
import {
    allocateByWeightWithCapacity,
    buildDivisionPlacement,
    buildPlacementUnits,
    buildTeamsForDivision,
    compareCandidates,
    getDivisionTargets,
    getSnakeOrder,
    placementReasonClasses,
    placementReasonLabel,
    placementReasonOrder,
    toOriginalPlacedPlayer
} from "./placement"
import type { Week3Candidate, Week3Division } from "./week3-types"

function candidate(overrides: Partial<Week3Candidate> = {}): Week3Candidate {
    const id = overrides.userId ?? "user-x"
    return {
        userId: id,
        firstName: `First-${id}`,
        lastName: `Last-${id}`,
        preferredName: null,
        male: true,
        pairUserId: null,
        pairWithName: null,
        overallMostRecent: 1,
        placementScore: 50,
        ratingScore: null,
        seasonsPlayedCount: 1,
        consecutiveSeasonsInTopDiv: 0,
        captainDivisionId: null,
        captainDivisionName: null,
        isCaptain: false,
        week2DivisionId: null,
        forcedMoveDirection: null,
        recommendationUpCount: 0,
        recommendationDownCount: 0,
        ...overrides
    }
}

describe("placement reason metadata", () => {
    it("has a label and style for every ordered reason", () => {
        for (const reason of placementReasonOrder) {
            expect(placementReasonLabel[reason]).toBeTruthy()
            expect(placementReasonClasses[reason]).toBeTruthy()
        }
        expect(new Set(placementReasonOrder).size).toBe(
            placementReasonOrder.length
        )
    })
})

describe("compareCandidates", () => {
    it("orders by placement score, then by display name", () => {
        const low = candidate({ userId: "z", placementScore: 1 })
        const highA = candidate({
            userId: "a",
            firstName: "Alpha",
            placementScore: 9
        })
        const highB = candidate({
            userId: "b",
            firstName: "Beta",
            placementScore: 9
        })
        expect(
            [highB, highA, low].sort(compareCandidates).map((c) => c.userId)
        ).toEqual(["z", "a", "b"])
    })
})

describe("buildPlacementUnits", () => {
    it("merges reciprocal pairs and keeps one-way requests apart", () => {
        const a = candidate({
            userId: "a",
            pairUserId: "b",
            placementScore: 10
        })
        const b = candidate({
            userId: "b",
            pairUserId: "a",
            placementScore: 20
        })
        const oneWay = candidate({ userId: "c", pairUserId: "a" })

        const units = buildPlacementUnits([a, b, oneWay])
        const sizes = units.map((u) => u.size).sort()
        expect(sizes).toEqual([1, 2])
        const pairUnit = units.find((u) => u.size === 2)
        expect(pairUnit?.averageScore).toBe(15)
    })
})

describe("allocateByWeightWithCapacity", () => {
    it("honors capacities while allocating the full total", () => {
        // Overflow from the capped first slot goes to the least-loaded slot
        const result = allocateByWeightWithCapacity(12, [2, 6, 10], [1, 1, 1])
        expect(result).toEqual([2, 4, 6])
        expect(result.reduce((a, b) => a + b, 0)).toBe(12)
        result.forEach((n, i) => {
            expect(n).toBeLessThanOrEqual([2, 6, 10][i])
        })
    })
})

describe("getSnakeOrder", () => {
    it("matches the week-2 snake pattern", () => {
        expect(getSnakeOrder(8, 4)).toEqual([0, 1, 2, 3, 3, 2, 1, 0])
    })
})

function division(overrides: Partial<Week3Division> = {}): Week3Division {
    return {
        id: 1,
        name: "AA",
        level: 1,
        index: 0,
        teamCount: 2,
        isLast: false,
        usesCoaches: false,
        ...overrides
    }
}

/**
 * 24 players, scores 1..24, alternating male/non-male by score parity.
 * Week-3 placement anchors on week-2 results, so the top half carries
 * week2DivisionId 1 and the bottom half 2.
 */
function buildBalancedPool(): Week3Candidate[] {
    return Array.from({ length: 24 }, (_, i) =>
        candidate({
            userId: `p${String(i).padStart(2, "0")}`,
            placementScore: i + 1,
            male: i % 2 === 0,
            week2DivisionId: i < 12 ? 1 : 2
        })
    )
}

describe("getDivisionTargets", () => {
    it("sizes divisions by team count and mirrors the gender ratio", () => {
        const divisions = [
            division({ id: 1, teamCount: 2 }),
            division({
                id: 2,
                name: "A",
                level: 2,
                index: 1,
                teamCount: 2,
                isLast: true
            })
        ]
        const targets = getDivisionTargets(divisions, buildBalancedPool())
        for (const id of [1, 2]) {
            expect(targets.get(id)?.size).toBe(12)
            expect(targets.get(id)?.male).toBe(6)
            expect(targets.get(id)?.nonMale).toBe(6)
        }
    })
})

describe("buildDivisionPlacement", () => {
    const divisions = [
        division({ id: 1, teamCount: 2 }),
        division({
            id: 2,
            name: "A",
            level: 2,
            index: 1,
            teamCount: 2,
            isLast: true
        })
    ]

    it("places every player exactly once and hits size targets", () => {
        const { placement } = buildDivisionPlacement(
            divisions,
            buildBalancedPool()
        )
        const placed = [...placement.values()].flatMap((bucket) =>
            bucket.units.flatMap((unit) => unit.players.map((p) => p.userId))
        )
        expect(placed).toHaveLength(24)
        expect(new Set(placed).size).toBe(24)
        expect(placement.get(1)?.size).toBe(12)
        expect(placement.get(2)?.size).toBe(12)
    })

    it("locks captains to their division and reports them as locked", () => {
        const pool = buildBalancedPool()
        pool[23] = candidate({
            userId: "locked-captain",
            placementScore: 24,
            male: false,
            isCaptain: true,
            captainDivisionId: 1
        })

        const { placement, lockedUserIds } = buildDivisionPlacement(
            divisions,
            pool
        )
        const divisionOne = (placement.get(1)?.units ?? []).flatMap((unit) =>
            unit.players.map((p) => p.userId)
        )
        expect(divisionOne).toContain("locked-captain")
        expect(lockedUserIds.has("locked-captain")).toBe(true)
    })

    it("assigns a placement reason to every player", () => {
        const pool = buildBalancedPool()
        const { reasonByUser } = buildDivisionPlacement(divisions, pool)
        for (const player of pool) {
            expect(reasonByUser.get(player.userId)).toBeDefined()
        }
    })
})

describe("buildTeamsForDivision", () => {
    it("builds balanced teams with captains spread across them", () => {
        const pool = Array.from({ length: 18 }, (_, i) =>
            candidate({
                userId: `t${String(i).padStart(2, "0")}`,
                placementScore: i + 1,
                male: i % 2 === 0,
                isCaptain: i < 3
            })
        )
        pool[10] = candidate({
            ...pool[10],
            userId: pool[10].userId,
            pairUserId: pool[11].userId
        })
        pool[11] = candidate({
            ...pool[11],
            userId: pool[11].userId,
            pairUserId: pool[10].userId
        })

        const teams = buildTeamsForDivision(
            division({ teamCount: 3 }),
            pool.map(toOriginalPlacedPlayer)
        )

        expect(teams).toHaveLength(3)
        const assigned = teams.flatMap((team) =>
            team.players.map((p) => p.assignmentUserId)
        )
        expect(assigned).toHaveLength(18)
        expect(new Set(assigned).size).toBe(18)

        for (const team of teams) {
            expect(team.players).toHaveLength(6)
            expect(team.players.filter((p) => p.isCaptain)).toHaveLength(1)
            expect(team.maleCount).toBe(3)
        }

        const pairTeams = teams.filter((team) =>
            team.players.some(
                (p) =>
                    p.assignmentUserId === pool[10].userId ||
                    p.assignmentUserId === pool[11].userId
            )
        )
        expect(pairTeams).toHaveLength(1)
    })
})
