import { describe, expect, it } from "vitest"
import {
    buildPlacementUnits,
    compareCandidates,
    sortDivisionPlayers,
    toOriginalPlacedPlayer
} from "./units"
import type { PreseasonCandidate } from "./types"

function candidate(
    overrides: Partial<PreseasonCandidate> = {}
): PreseasonCandidate {
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
        captainDivisionId: null,
        captainDivisionName: null,
        isCaptain: false,
        isCoach: false,
        coachDivisionName: null,
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
        expect(pairUnit.isMutualPair).toBe(true)
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
        expect(unit.captainDivisionId).toBe(7)
        expect(unit.hasCaptain).toBe(false)
    })

    it("merges pairs when neither side has week-2 division data (week 2)", () => {
        const a = candidate({ userId: "a", pairUserId: "b" })
        const b = candidate({ userId: "b", pairUserId: "a" })
        const units = buildPlacementUnits([a, b])
        expect(units).toHaveLength(1)
        expect(units[0].preferredWeek2DivisionId).toBeNull()
    })

    it("refuses to pair players from different week-2 divisions (week 3)", () => {
        const a = candidate({
            userId: "a",
            pairUserId: "b",
            week2DivisionId: 1
        })
        const b = candidate({
            userId: "b",
            pairUserId: "a",
            week2DivisionId: 2
        })
        const units = buildPlacementUnits([a, b])
        expect(units).toHaveLength(2)
    })

    it("carries the shared week-2 division onto the unit", () => {
        const a = candidate({
            userId: "a",
            pairUserId: "b",
            week2DivisionId: 3
        })
        const b = candidate({
            userId: "b",
            pairUserId: "a",
            week2DivisionId: 3
        })
        const [unit] = buildPlacementUnits([a, b])
        expect(unit.size).toBe(2)
        expect(unit.preferredWeek2DivisionId).toBe(3)
    })
})
