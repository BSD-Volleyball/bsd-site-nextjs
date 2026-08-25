import { describe, expect, it } from "vitest"
import { buildContinuityDivisionPlacement } from "./division-continuity"
import {
    placementReasonClasses,
    placementReasonLabel,
    placementReasonOrder
} from "./placement-shared"
import type { Week3Candidate, PreseasonDivision } from "./types"

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
        isCoach: false,
        coachDivisionName: null,
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

function division(
    overrides: Partial<PreseasonDivision> = {}
): PreseasonDivision {
    return {
        id: 1,
        name: "AA",
        level: 1,
        index: 0,
        teamCount: 2,
        isLast: false,
        usesCoaches: false,
        malePerTeam: 5,
        nonMalePerTeam: 3,
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

describe("buildContinuityDivisionPlacement", () => {
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
        const { placement } = buildContinuityDivisionPlacement(
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

        const { placement, lockedUserIds } = buildContinuityDivisionPlacement(
            divisions,
            pool
        )
        const divisionOne = (placement.get(1)?.units ?? []).flatMap((unit) =>
            unit.players.map((p) => p.userId)
        )
        expect(divisionOne).toContain("locked-captain")
        expect(lockedUserIds.has("locked-captain")).toBe(true)
    })

    it("places a coach by week-2 continuity, not as a locked captain", () => {
        const pool = buildBalancedPool()
        pool[23] = candidate({
            userId: "coach",
            placementScore: 24,
            male: false,
            isCoach: true,
            coachDivisionName: "BB",
            week2DivisionId: 2
        })

        const { placement, reasonByUser, lockedUserIds } =
            buildContinuityDivisionPlacement(divisions, pool)
        const divisionTwo = (placement.get(2)?.units ?? []).flatMap((unit) =>
            unit.players.map((p) => p.userId)
        )
        expect(divisionTwo).toContain("coach")
        expect(reasonByUser.get("coach")).toBe("tryout2_same_division")
        expect(lockedUserIds.has("coach")).toBe(false)
    })

    it("assigns a placement reason to every player", () => {
        const pool = buildBalancedPool()
        const { reasonByUser } = buildContinuityDivisionPlacement(
            divisions,
            pool
        )
        for (const player of pool) {
            expect(reasonByUser.get(player.userId)).toBeDefined()
        }
    })

    it("keeps players in their week-2 division by default", () => {
        const pool = buildBalancedPool()
        const { placement, reasonByUser } = buildContinuityDivisionPlacement(
            divisions,
            pool
        )
        const divisionTwo = (placement.get(2)?.units ?? []).flatMap((unit) =>
            unit.players.map((p) => p.userId)
        )
        expect(divisionTwo).toContain("p23")
        expect(reasonByUser.get("p23")).toBe("tryout2_same_division")
    })

    it("shifts forced moves exactly one division", () => {
        const pool = buildBalancedPool()
        pool[23] = candidate({
            userId: "mover",
            placementScore: 24,
            week2DivisionId: 2,
            forcedMoveDirection: "up"
        })

        const { placement, reasonByUser } = buildContinuityDivisionPlacement(
            divisions,
            pool
        )
        const divisionOne = (placement.get(1)?.units ?? []).flatMap((unit) =>
            unit.players.map((p) => p.userId)
        )
        expect(divisionOne).toContain("mover")
        expect(reasonByUser.get("mover")).toBe("forced_move_up")
    })

    it("places players without a week-2 division by score band", () => {
        const pool = buildBalancedPool()
        pool[0] = candidate({
            userId: "newcomer",
            placementScore: 90,
            week2DivisionId: null
        })

        const { placement, reasonByUser } = buildContinuityDivisionPlacement(
            divisions,
            pool
        )
        expect(reasonByUser.get("newcomer")).toBe("score_based")
        // Score 90 → band level 2 → division 2
        const divisionTwo = (placement.get(2)?.units ?? []).flatMap((unit) =>
            unit.players.map((p) => p.userId)
        )
        expect(divisionTwo).toContain("newcomer")
    })
})
