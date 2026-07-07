import { describe, expect, it } from "vitest"
import {
    buildAssignments,
    buildPairCandidates,
    buildPairInfoMap,
    cleanGroupLabel,
    displayName,
    reorder
} from "./placement"
import type { Week1Candidate } from "./week1-types"

function candidate(overrides: Partial<Week1Candidate> = {}): Week1Candidate {
    const id = overrides.userId ?? "user-x"
    return {
        userId: id,
        oldId: null,
        firstName: `First-${id}`,
        lastName: `Last-${id}`,
        preferredName: null,
        male: true,
        playFirstWeek: true,
        pairUserId: null,
        group: "week1_other",
        groupLabel: "7) Asked for week 1",
        overallMostRecent: 1,
        placementScore: 50,
        seasonsPlayedCount: 1,
        lastDraftSeasonId: null,
        lastDraftSeasonLabel: null,
        lastDraftDivisionName: null,
        previousDraftSeasonLabel: null,
        previousDraftDivisionName: null,
        pairWithName: null,
        ...overrides
    }
}

/**
 * A realistic 96-player pool: for every block of four scores, the first two
 * players are a reciprocal pair and the last two are singles. Genders
 * alternate male/non-male inside each block, and every fifth player is new.
 * Pair units keep the placement search space small, as in real data.
 */
function buildPool(): Week1Candidate[] {
    const pool: Week1Candidate[] = []
    for (let block = 0; block < 24; block++) {
        const base = block * 4
        const ids = [0, 1, 2, 3].map(
            (i) => `p${String(base + i).padStart(2, "0")}`
        )
        pool.push(
            candidate({
                userId: ids[0],
                placementScore: base + 1,
                male: true,
                pairUserId: ids[1],
                overallMostRecent: base % 5 === 0 ? null : 1
            }),
            candidate({
                userId: ids[1],
                placementScore: base + 2,
                male: false,
                pairUserId: ids[0]
            }),
            candidate({
                userId: ids[2],
                placementScore: base + 3,
                male: true,
                overallMostRecent: (base + 2) % 5 === 0 ? null : 1
            }),
            candidate({
                userId: ids[3],
                placementScore: base + 4,
                male: false
            })
        )
    }
    return pool
}

describe("buildAssignments with a full 96-player pool", () => {
    const pool = buildPool()
    const { assignments } = buildAssignments(pool)
    const byUser = new Map(assignments.map((a) => [a.userId, a]))
    const scoreByUser = new Map(pool.map((p) => [p.userId, p.placementScore]))

    it("assigns every player exactly once", () => {
        expect(assignments).toHaveLength(96)
        expect(byUser.size).toBe(96)
    })

    it("fills four courts of 24 with two sessions of 12", () => {
        for (const court of [1, 2, 3, 4]) {
            const courtAssignments = assignments.filter(
                (a) => a.courtNumber === court
            )
            expect(courtAssignments).toHaveLength(24)
            for (const session of [1, 2]) {
                expect(
                    courtAssignments.filter((a) => a.sessionNumber === session)
                ).toHaveLength(12)
            }
        }
    })

    it("groups courts by ascending placement score", () => {
        // With scores 1..96 and clean 24-slot cuts, court N holds exactly
        // the score range (N-1)*24+1 .. N*24
        for (const court of [1, 2, 3, 4]) {
            const scores = assignments
                .filter((a) => a.courtNumber === court)
                .map((a) => scoreByUser.get(a.userId) ?? -1)
            expect(Math.min(...scores)).toBe((court - 1) * 24 + 1)
            expect(Math.max(...scores)).toBe(court * 24)
        }
    })

    it("keeps reciprocal pairs in the same court and session", () => {
        for (const player of pool) {
            if (!player.pairUserId) continue
            const own = byUser.get(player.userId)
            const partner = byUser.get(player.pairUserId)
            expect(own).toBeDefined()
            expect(partner).toBeDefined()
            expect(own?.courtNumber).toBe(partner?.courtNumber)
            expect(own?.sessionNumber).toBe(partner?.sessionNumber)
        }
    })

    it("balances genders across the two sessions of each court", () => {
        const maleByUser = new Map(pool.map((p) => [p.userId, p.male]))
        for (const court of [1, 2, 3, 4]) {
            for (const session of [1, 2]) {
                const males = assignments.filter(
                    (a) =>
                        a.courtNumber === court &&
                        a.sessionNumber === session &&
                        maleByUser.get(a.userId) === true
                )
                // Each court holds 12 males; targets put 6 in each session
                expect(males).toHaveLength(6)
            }
        }
    })
})

describe("buildAssignments with a partial pool", () => {
    it("still assigns every player exactly once", () => {
        const pool = Array.from({ length: 10 }, (_, i) =>
            candidate({ userId: `q${i}`, placementScore: i + 1 })
        )
        const { assignments } = buildAssignments(pool)
        expect(assignments).toHaveLength(10)
        expect(new Set(assignments.map((a) => a.userId)).size).toBe(10)
    })
})

describe("buildPairCandidates", () => {
    it("detects reciprocal pairs once and prefers them over one-way picks", () => {
        const a = candidate({ userId: "a", pairUserId: "b" })
        const b = candidate({ userId: "b", pairUserId: "a" })
        const c = candidate({ userId: "c", pairUserId: "a" })

        const pairs = buildPairCandidates([a, b, c])
        expect(pairs).toHaveLength(2)
        // Reciprocal pair listed first
        expect(pairs[0].map((p) => p.userId).sort()).toEqual(["a", "b"])
        expect(pairs[1].map((p) => p.userId)).toEqual(["c", "a"])
    })

    it("ignores pair picks that are absent or self-referential", () => {
        const a = candidate({ userId: "a", pairUserId: "missing" })
        const b = candidate({ userId: "b", pairUserId: "b" })
        expect(buildPairCandidates([a, b])).toHaveLength(0)
    })
})

describe("buildPairInfoMap", () => {
    it("records the partner name and average score for both members", () => {
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

        const info = buildPairInfoMap([a, b])
        expect(info.get("a")?.averageScore).toBe(15)
        expect(info.get("a")?.partnerName).toBe(displayName(b))
        expect(info.get("b")?.averageScore).toBe(15)
    })
})

describe("small helpers", () => {
    it("displayName prefers the preferred name", () => {
        expect(
            displayName(
                candidate({
                    firstName: "Jordan",
                    lastName: "Lee",
                    preferredName: "JJ"
                })
            )
        ).toBe("JJ Lee")
        expect(
            displayName(candidate({ firstName: "Jordan", lastName: "Lee" }))
        ).toBe("Jordan Lee")
    })

    it("cleanGroupLabel strips the numeric prefix", () => {
        expect(cleanGroupLabel("3) Missing other tryout")).toBe(
            "Missing other tryout"
        )
        expect(cleanGroupLabel("No prefix")).toBe("No prefix")
    })

    it("reorder moves an element without mutating the input", () => {
        const items = ["a", "b", "c", "d"]
        expect(reorder(items, 0, 2)).toEqual(["b", "c", "a", "d"])
        expect(reorder(items, 3, 0)).toEqual(["d", "a", "b", "c"])
        expect(reorder(items, 1, 1)).toBe(items)
        expect(items).toEqual(["a", "b", "c", "d"])
    })
})
