import { describe, expect, it } from "vitest"
import {
    computeUsavTallies,
    usavRankTeams,
    type UsavMatch,
    type UsavTeam
} from "@/lib/usav-ranking"
import type { SetsFormat } from "@/lib/tournament-sets"

// These fixtures use 2-set decisive matches; exact-2 (the pool default) matches
// the original "two sets entered = final" convention exactly.
const POOL: SetsFormat = { mode: "exact", count: 2 }

function t(id: number, name = `Team ${id}`): UsavTeam {
    return { id, name }
}

// A match reported per set: each entry is [homePoints, awayPoints].
function mm(
    home: number,
    away: number,
    sets: Array<[number, number]>,
    winner: number
): UsavMatch {
    const [s1, s2, s3] = sets
    return {
        home_team_id: home,
        away_team_id: away,
        winner_team_id: winner,
        home_set1_score: s1?.[0] ?? null,
        away_set1_score: s1?.[1] ?? null,
        home_set2_score: s2?.[0] ?? null,
        away_set2_score: s2?.[1] ?? null,
        home_set3_score: s3?.[0] ?? null,
        away_set3_score: s3?.[1] ?? null
    }
}

// Winner (home) takes a clean 2-0 (25-20, 25-20).
function win(winner: number, loser: number): UsavMatch {
    return mm(
        winner,
        loser,
        [
            [25, 20],
            [25, 20]
        ],
        winner
    )
}

function ids(teams: UsavTeam[], matches: UsavMatch[]): number[] {
    return usavRankTeams(teams, matches, POOL).map((r) => r.teamId)
}

describe("usavRankTeams — primary match record", () => {
    it("orders teams by match wins", () => {
        const teams = [t(1), t(2), t(3)]
        const matches = [win(1, 2), win(1, 3), win(2, 3)]
        expect(ids(teams, matches)).toEqual([1, 2, 3])
    })

    it("places teams with no completed matches at the bottom", () => {
        const teams = [t(1), t(2), t(3)]
        const matches = [win(1, 2)]
        // T3 never played; T1 (1 win) then T2 (0, but played) then T3 (0).
        const ranked = usavRankTeams(teams, matches, POOL)
        expect(ranked[0].teamId).toBe(1)
    })
})

describe("usavRankTeams — two-team ties always head-to-head", () => {
    it("head-to-head winner finishes ahead even with lower set % and point %", () => {
        const teams = [t(1), t(2), t(3), t(4)]
        const matches = [
            // T1 edges T2 head-to-head 2-1.
            mm(
                1,
                2,
                [
                    [25, 23],
                    [23, 25],
                    [15, 13]
                ],
                1
            ),
            win(3, 1), // T1 loses to T3
            win(2, 3), // T2 dominates T3
            win(2, 4), // T2 dominates T4
            win(1, 4) // T1 beats T4
        ]
        // T1 and T2 both have 2 wins; T2 has the better set % and point %,
        // but T1 beat T2 head-to-head, so T1 must finish ahead.
        const tallies = computeUsavTallies(teams, matches, POOL)
        expect(tallies.get(1)!.matchWins).toBe(2)
        expect(tallies.get(2)!.matchWins).toBe(2)
        expect(tallies.get(2)!.setPct).toBeGreaterThan(tallies.get(1)!.setPct)
        expect(tallies.get(2)!.pointPct).toBeGreaterThan(
            tallies.get(1)!.pointPct
        )
        expect(ids(teams, matches)).toEqual([1, 2, 3, 4])
    })
})

describe("usavRankTeams — three-or-more-team ties", () => {
    it("peels beats-all to the top and lost-to-all to the bottom", () => {
        // 5-team pool: T5 finishes 3-1, T4 1-3, and T1/T2/T3 all 2-2.
        // Within the {1,2,3} tie: T1 beat both, T3 lost to both, T2 in between.
        const teams = [t(1), t(2), t(3), t(4), t(5)]
        const matches = [
            win(1, 2),
            win(1, 3),
            win(4, 1),
            win(5, 1),
            win(2, 3),
            win(2, 4),
            win(5, 2),
            win(3, 4),
            win(3, 5),
            win(5, 4)
        ]
        const tallies = computeUsavTallies(teams, matches, POOL)
        expect(tallies.get(1)!.matchWins).toBe(2)
        expect(tallies.get(2)!.matchWins).toBe(2)
        expect(tallies.get(3)!.matchWins).toBe(2)
        expect(tallies.get(5)!.matchWins).toBe(3)
        expect(tallies.get(4)!.matchWins).toBe(1)
        expect(ids(teams, matches)).toEqual([5, 1, 2, 3, 4])
    })

    it("falls through to set percentage on a head-to-head cycle", () => {
        // T1>T2, T2>T3, T3>T1 — each 1-1, no team beats or loses to all.
        const teams = [t(1), t(2), t(3)]
        const matches = [
            mm(
                1,
                2,
                [
                    [25, 10],
                    [25, 10]
                ],
                1
            ), // T1 set% boosted
            mm(
                2,
                3,
                [
                    [25, 20],
                    [20, 25],
                    [15, 10]
                ],
                2
            ),
            mm(
                3,
                1,
                [
                    [25, 23],
                    [23, 25],
                    [15, 13]
                ],
                3
            )
        ]
        // Set %: T1 = 3/5 (.60), T3 = 3/6 (.50), T2 = 2/5 (.40).
        expect(ids(teams, matches)).toEqual([1, 3, 2])
    })
})

describe("usavRankTeams — set % then point %", () => {
    it("uses point percentage when teams never met and set % ties", () => {
        const teams = [t(1), t(2), t(3), t(4)]
        const matches = [
            mm(
                1,
                3,
                [
                    [25, 10],
                    [25, 10]
                ],
                1
            ), // T1 point% .714
            mm(
                2,
                4,
                [
                    [25, 20],
                    [25, 20]
                ],
                2
            ) // T2 point% .556
        ]
        // T1 & T2: 1 win, set% 1.0, never played. Point% breaks it: T1 ahead.
        // T4 (.444) finishes ahead of T3 (.286) among the winless teams.
        expect(ids(teams, matches)).toEqual([1, 2, 4, 3])
    })
})

describe("usavRankTeams — deterministic name fallback", () => {
    it("breaks a total tie alphabetically by name", () => {
        const teams = [t(1, "Zeta"), t(2, "Alpha"), t(3), t(4)]
        const matches = [
            mm(
                1,
                3,
                [
                    [25, 10],
                    [25, 10]
                ],
                1
            ),
            mm(
                2,
                4,
                [
                    [25, 10],
                    [25, 10]
                ],
                2
            )
        ]
        // T1/T2 identical record & percentages, never played → Alpha before Zeta.
        expect(ids(teams, matches)).toEqual([2, 1, 3, 4])
    })
})
