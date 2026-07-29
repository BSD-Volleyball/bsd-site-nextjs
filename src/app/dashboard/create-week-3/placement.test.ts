import { describe, expect, it } from "vitest"
import {
    buildDivisionPlacement,
    placementReasonClasses,
    placementReasonLabel,
    placementReasonOrder
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
