import { describe, expect, it } from "vitest"
import {
    buildDivisionPlacement,
    buildTeamsForDivision,
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

function division(overrides: Partial<Week2Division> = {}): Week2Division {
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
