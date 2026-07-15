import { describe, expect, it } from "vitest"
import { computeCareerStats } from "@/lib/player-career-stats"
import { rosterKey, type EloMatchInput } from "@/lib/player-elo"

function eloMatch(overrides: Partial<EloMatchInput> = {}): EloMatchInput {
    return {
        id: 1,
        seasonId: 1,
        week: 1,
        date: null,
        playoff: false,
        divisionLevel: 1,
        homeTeamId: null,
        awayTeamId: null,
        winner: null,
        homeScore: null,
        awayScore: null,
        home_set1_score: null,
        away_set1_score: null,
        home_set2_score: null,
        away_set2_score: null,
        home_set3_score: null,
        away_set3_score: null,
        ...overrides
    }
}

function setMatch(
    id: number,
    homeTeamId: number,
    awayTeamId: number,
    sets: Array<[number, number]>,
    overrides: Partial<EloMatchInput> = {}
): EloMatchInput {
    const [set1, set2, set3] = sets
    const homeSets = sets.filter(([h, a]) => h > a).length
    const awaySets = sets.filter(([h, a]) => a > h).length
    return eloMatch({
        id,
        homeTeamId,
        awayTeamId,
        winner: homeSets > awaySets ? homeTeamId : awayTeamId,
        home_set1_score: set1?.[0] ?? null,
        away_set1_score: set1?.[1] ?? null,
        home_set2_score: set2?.[0] ?? null,
        away_set2_score: set2?.[1] ?? null,
        home_set3_score: set3?.[0] ?? null,
        away_set3_score: set3?.[1] ?? null,
        ...overrides
    })
}

function rosters(
    entries: Array<[number, number, string[]]>
): Map<string, string[]> {
    const map = new Map<string, string[]>()
    for (const [matchId, teamId, userIds] of entries) {
        map.set(rosterKey(matchId, teamId), userIds)
    }
    return map
}

describe("computeCareerStats", () => {
    it("aggregates match, set, and point outcomes from both sides", () => {
        // "a" wins match 1 at home (2-1 sets) and loses match 2 away (0-2)
        const matches = [
            setMatch(1, 10, 20, [
                [25, 20],
                [20, 25],
                [15, 10]
            ]),
            setMatch(
                2,
                30,
                40,
                [
                    [25, 15],
                    [25, 20]
                ],
                { week: 2 }
            )
        ]
        const stats = computeCareerStats(
            "a",
            matches,
            rosters([
                [1, 10, ["a", "b"]],
                [1, 20, ["c"]],
                [2, 30, ["d"]],
                [2, 40, ["a"]]
            ])
        )
        expect(stats.matchWins).toBe(1)
        expect(stats.matchLosses).toBe(1)
        expect(stats.setWins).toBe(2)
        expect(stats.setLosses).toBe(3)
        // Match 1: +5 (60 - 55). Match 2 (away): 35 - 50 = -15. Total -10.
        expect(stats.pointDiff).toBe(-10)
    })

    it("tracks playoff record separately", () => {
        const matches = [
            setMatch(1, 10, 20, [[25, 20]]),
            setMatch(2, 10, 20, [[20, 25]], { week: 2, playoff: true })
        ]
        const stats = computeCareerStats(
            "a",
            matches,
            rosters([
                [1, 10, ["a"]],
                [1, 20, ["b"]],
                [2, 10, ["a"]],
                [2, 20, ["b"]]
            ])
        )
        // The playoff loss also counts toward the overall match record
        expect(stats.matchWins).toBe(1)
        expect(stats.matchLosses).toBe(1)
        expect(stats.playoffWins).toBe(0)
        expect(stats.playoffLosses).toBe(1)
    })

    it("ignores matches the player was not rostered for", () => {
        const matches = [setMatch(1, 10, 20, [[25, 20]])]
        const stats = computeCareerStats(
            "outsider",
            matches,
            rosters([
                [1, 10, ["a"]],
                [1, 20, ["b"]]
            ])
        )
        expect(stats.matchWins + stats.matchLosses).toBe(0)
        expect(stats.setWins + stats.setLosses).toBe(0)
        expect(stats.pointDiff).toBe(0)
    })

    it("counts match wins from legacy game counts when sets are missing", () => {
        const legacy = eloMatch({
            id: 1,
            homeTeamId: 10,
            awayTeamId: 20,
            homeScore: 2,
            awayScore: 1,
            winner: 10
        })
        const stats = computeCareerStats(
            "a",
            [legacy],
            rosters([
                [1, 10, ["a"]],
                [1, 20, ["b"]]
            ])
        )
        expect(stats.matchWins).toBe(1)
        expect(stats.setWins).toBe(2)
        expect(stats.setLosses).toBe(1)
        // Legacy scores carry no point information
        expect(stats.pointDiff).toBe(0)
    })
})
