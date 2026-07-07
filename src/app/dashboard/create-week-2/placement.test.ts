import { describe, expect, it } from "vitest"
import {
    allocateByWeightWithCapacity,
    buildDivisionPlacement,
    buildPlacementUnits,
    buildTeamsForDivision,
    compareCandidates,
    getDivisionTargets,
    getSnakeOrder,
    sortDivisionPlayers,
    toOriginalPlacedPlayer
} from "./placement"
import type { Week2Candidate, Week2Division } from "./week2-types"

function candidate(overrides: Partial<Week2Candidate> = {}): Week2Candidate {
    const id = overrides.userId ?? "user-x"
    return {
        userId: id,
        oldId: null,
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
        captainDivisionId: null,
        captainDivisionName: null,
        isCaptain: false,
        lastDivisionName: null,
        ...overrides
    }
}

describe("compareCandidates / sortDivisionPlayers", () => {
    it("orders by placement score, then by display name", () => {
        const low = candidate({ userId: "z", placementScore: 1 })
        const highA = candidate({
            userId: "a",
            firstName: "Alpha",
            lastName: "A",
            placementScore: 9
        })
        const highB = candidate({
            userId: "b",
            firstName: "Beta",
            lastName: "B",
            placementScore: 9
        })
        expect(
            [highB, highA, low].sort(compareCandidates).map((c) => c.userId)
        ).toEqual(["z", "a", "b"])
    })

    it("sortDivisionPlayers lists males before non-males", () => {
        const players = [
            candidate({ userId: "f1", male: false, placementScore: 1 }),
            candidate({ userId: "m1", male: true, placementScore: 5 }),
            candidate({ userId: "m2", male: true, placementScore: 2 })
        ].map(toOriginalPlacedPlayer)

        const sorted = sortDivisionPlayers(players)
        expect(sorted.map((p) => p.sourceUserId)).toEqual(["m2", "m1", "f1"])
    })
})

describe("buildPlacementUnits", () => {
    it("merges reciprocal pairs into one unit with the averaged score", () => {
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
        const single = candidate({ userId: "c", placementScore: 5 })

        const units = buildPlacementUnits([a, b, single])
        expect(units).toHaveLength(2)
        // Sorted by average score: single (5) before pair (15)
        expect(units[0].players.map((p) => p.userId)).toEqual(["c"])
        const pairUnit = units[1]
        expect(pairUnit.size).toBe(2)
        expect(pairUnit.averageScore).toBe(15)
        expect(pairUnit.id).toBe("a:b")
        expect(pairUnit.maleCount).toBe(2)
    })

    it("does not merge one-way pair requests", () => {
        const a = candidate({ userId: "a", pairUserId: "b" })
        const b = candidate({ userId: "b", pairUserId: null })
        const units = buildPlacementUnits([a, b])
        expect(units).toHaveLength(2)
        expect(units.every((u) => u.size === 1)).toBe(true)
    })

    it("refuses to pair captains locked to different divisions", () => {
        const a = candidate({
            userId: "a",
            pairUserId: "b",
            captainDivisionId: 1
        })
        const b = candidate({
            userId: "b",
            pairUserId: "a",
            captainDivisionId: 2
        })
        const units = buildPlacementUnits([a, b])
        expect(units).toHaveLength(2)
    })

    it("locks a pair to the captain's division", () => {
        const a = candidate({
            userId: "a",
            pairUserId: "b",
            captainDivisionId: 7
        })
        const b = candidate({ userId: "b", pairUserId: "a" })
        const [unit] = buildPlacementUnits([a, b])
        expect(unit.size).toBe(2)
        expect(unit.lockedDivisionId).toBe(7)
    })
})

describe("allocateByWeightWithCapacity", () => {
    it("splits evenly for equal weights", () => {
        expect(allocateByWeightWithCapacity(10, [10, 10], [1, 1])).toEqual([
            5, 5
        ])
    })

    it("respects capacity limits and reroutes the overflow", () => {
        expect(allocateByWeightWithCapacity(10, [3, 10], [1, 1])).toEqual([
            3, 7
        ])
    })

    it("allocates everything even with uneven rounding", () => {
        const result = allocateByWeightWithCapacity(7, [10, 10, 10], [1, 1, 1])
        expect(result.reduce((a, b) => a + b, 0)).toBe(7)
        for (const n of result) {
            expect(n).toBeGreaterThanOrEqual(2)
        }
    })

    it("returns zeros for zero totals or zero weights", () => {
        expect(allocateByWeightWithCapacity(0, [5, 5], [1, 1])).toEqual([0, 0])
        expect(allocateByWeightWithCapacity(5, [5, 5], [0, 0])).toEqual([0, 0])
    })

    it("weights the allocation proportionally", () => {
        expect(allocateByWeightWithCapacity(9, [10, 10], [2, 1])).toEqual([
            6, 3
        ])
    })
})

function division(overrides: Partial<Week2Division> = {}): Week2Division {
    return {
        id: 1,
        name: "AA",
        level: 1,
        index: 0,
        teamCount: 2,
        isLast: false,
        isCoachDiv: false,
        ...overrides
    }
}

/** 24 players, scores 1..24, alternating male/non-male by score parity */
function buildBalancedPool(): Week2Candidate[] {
    return Array.from({ length: 24 }, (_, i) =>
        candidate({
            userId: `p${String(i).padStart(2, "0")}`,
            placementScore: i + 1,
            male: i % 2 === 0
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
            const target = targets.get(id)
            expect(target?.size).toBe(12)
            expect(target?.male).toBe(6)
            expect(target?.nonMale).toBe(6)
        }
    })

    it("returns an empty map when there are no teams", () => {
        expect(getDivisionTargets([], buildBalancedPool()).size).toBe(0)
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

    it("places every player exactly once and hits the size targets", () => {
        const pool = buildBalancedPool()
        const placement = buildDivisionPlacement(divisions, pool)

        const placed = [...placement.values()].flatMap((bucket) =>
            bucket.units.flatMap((unit) => unit.players.map((p) => p.userId))
        )
        expect(placed).toHaveLength(24)
        expect(new Set(placed).size).toBe(24)
        expect(placement.get(1)?.size).toBe(12)
        expect(placement.get(2)?.size).toBe(12)
    })

    it("puts stronger (lower-score) players in the higher division", () => {
        const placement = buildDivisionPlacement(divisions, buildBalancedPool())
        const scoresIn = (id: number) =>
            (placement.get(id)?.units ?? []).flatMap((unit) =>
                unit.players.map((p) => p.placementScore)
            )
        expect(Math.max(...scoresIn(1))).toBeLessThan(Math.min(...scoresIn(2)))
    })

    it("honors captain division locks regardless of score", () => {
        const pool = buildBalancedPool()
        // Worst player is a captain locked to the top division
        pool[23] = candidate({
            userId: "locked-captain",
            placementScore: 24,
            male: false,
            isCaptain: true,
            captainDivisionId: 1
        })

        const placement = buildDivisionPlacement(divisions, pool)
        const divisionOne = (placement.get(1)?.units ?? []).flatMap((unit) =>
            unit.players.map((p) => p.userId)
        )
        expect(divisionOne).toContain("locked-captain")
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
        // A mutual pair among non-captains
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
            // 9 males over 3 teams → 3 per team
            expect(team.maleCount).toBe(3)
        }

        // The mutual pair lands on one team together
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

describe("getSnakeOrder", () => {
    it("snakes forward then backward across teams", () => {
        expect(getSnakeOrder(8, 4)).toEqual([0, 1, 2, 3, 3, 2, 1, 0])
    })

    it("continues the pattern for longer drafts", () => {
        expect(getSnakeOrder(10, 4)).toEqual([0, 1, 2, 3, 3, 2, 1, 0, 0, 1])
    })

    it("stops at the requested length", () => {
        expect(getSnakeOrder(2, 4)).toEqual([0, 1])
        expect(getSnakeOrder(0, 4)).toEqual([])
    })

    it("gives every team an equal share over full rounds", () => {
        const order = getSnakeOrder(24, 6)
        const counts = new Map<number, number>()
        for (const team of order) {
            counts.set(team, (counts.get(team) ?? 0) + 1)
        }
        for (const team of [0, 1, 2, 3, 4, 5]) {
            expect(counts.get(team)).toBe(4)
        }
    })
})
