import { describe, expect, it } from "vitest"
import {
    computeStandings,
    getSetScores,
    rankDivision,
    type RankableMatch,
    type RankableTeam
} from "@/lib/team-ranking"

function team(
    id: number,
    name = `Team ${id}`,
    number: number | null = id
): RankableTeam {
    return { id, number, name }
}

function match(overrides: Partial<RankableMatch>): RankableMatch {
    return {
        week: 1,
        homeTeamId: null,
        awayTeamId: null,
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

// A match reported per set: each entry is [homePoints, awayPoints]
function setMatch(
    homeTeamId: number,
    awayTeamId: number,
    sets: Array<[number, number]>,
    week = 1
): RankableMatch {
    const [set1, set2, set3] = sets
    return match({
        week,
        homeTeamId,
        awayTeamId,
        home_set1_score: set1?.[0] ?? null,
        away_set1_score: set1?.[1] ?? null,
        home_set2_score: set2?.[0] ?? null,
        away_set2_score: set2?.[1] ?? null,
        home_set3_score: set3?.[0] ?? null,
        away_set3_score: set3?.[1] ?? null
    })
}

describe("getSetScores", () => {
    it("returns all sets that have both scores", () => {
        const scores = getSetScores(
            setMatch(1, 2, [
                [25, 20],
                [23, 25],
                [15, 10]
            ])
        )
        expect(scores).toEqual([
            { home: 25, away: 20 },
            { home: 23, away: 25 },
            { home: 15, away: 10 }
        ])
    })

    it("skips sets where either side is null", () => {
        const partial = match({
            home_set1_score: 25,
            away_set1_score: 20,
            home_set2_score: 25,
            away_set2_score: null
        })
        expect(getSetScores(partial)).toEqual([{ home: 25, away: 20 }])
    })

    it("returns an empty array when no sets were recorded", () => {
        expect(getSetScores(match({}))).toEqual([])
    })
})

describe("computeStandings", () => {
    it("counts each set as a win/loss and accumulates points", () => {
        const teams = [team(1), team(2)]
        const matches = [
            setMatch(1, 2, [
                [25, 20],
                [20, 25],
                [15, 10]
            ])
        ]

        const [first, second] = computeStandings(teams, matches)

        expect(first.id).toBe(1)
        expect(first.wins).toBe(2)
        expect(first.losses).toBe(1)
        expect(first.pointsFor).toBe(60)
        expect(first.pointDiff).toBe(5)

        expect(second.id).toBe(2)
        expect(second.wins).toBe(1)
        expect(second.losses).toBe(2)
        expect(second.pointsFor).toBe(55)
        expect(second.pointDiff).toBe(-5)
    })

    it("credits the away team when it wins sets", () => {
        const standings = computeStandings(
            [team(1), team(2)],
            [
                setMatch(1, 2, [
                    [20, 25],
                    [18, 25]
                ])
            ]
        )
        expect(standings[0].id).toBe(2)
        expect(standings[0].wins).toBe(2)
        expect(standings[1].id).toBe(1)
        expect(standings[1].losses).toBe(2)
    })

    it("falls back to legacy match-level scores when no sets exist", () => {
        const standings = computeStandings(
            [team(1), team(2)],
            [
                match({
                    homeTeamId: 1,
                    awayTeamId: 2,
                    homeScore: 2,
                    awayScore: 1
                })
            ]
        )
        const home = standings.find((s) => s.id === 1)
        const away = standings.find((s) => s.id === 2)

        expect(home?.wins).toBe(2)
        expect(home?.losses).toBe(1)
        expect(away?.wins).toBe(1)
        expect(away?.losses).toBe(2)
        // Legacy scores carry no point information
        expect(home?.pointsFor).toBe(0)
        expect(home?.pointDiff).toBe(0)
    })

    it("ignores matches with missing or unknown team ids", () => {
        const standings = computeStandings(
            [team(1), team(2)],
            [
                match({
                    homeTeamId: null,
                    awayTeamId: 2,
                    homeScore: 2,
                    awayScore: 0
                }),
                match({
                    homeTeamId: 99,
                    awayTeamId: 1,
                    homeScore: 2,
                    awayScore: 0
                })
            ]
        )
        for (const standing of standings) {
            expect(standing.wins).toBe(0)
            expect(standing.losses).toBe(0)
        }
    })

    it("excludes matches from excluded weeks", () => {
        const teams = [team(1), team(2)]
        const matches = [
            setMatch(1, 2, [[25, 10]], 1),
            setMatch(2, 1, [[25, 10]], 2),
            setMatch(2, 1, [[25, 10]], 2)
        ]

        const withAll = computeStandings(teams, matches)
        expect(withAll[0].id).toBe(2)

        const withoutWeek2 = computeStandings(teams, matches, {
            excludeWeeks: [2]
        })
        expect(withoutWeek2[0].id).toBe(1)
        expect(withoutWeek2[0].wins).toBe(1)
        expect(withoutWeek2[1].wins).toBe(0)
    })

    it("ranks by total set wins first", () => {
        const teams = [team(3), team(1), team(2)]
        const matches = [
            setMatch(1, 2, [
                [25, 10],
                [25, 10]
            ]),
            setMatch(1, 3, [
                [25, 10],
                [25, 10]
            ]),
            setMatch(2, 3, [
                [25, 10],
                [25, 10]
            ])
        ]
        const standings = computeStandings(teams, matches)
        expect(standings.map((s) => s.id)).toEqual([1, 2, 3])
    })

    it("breaks win ties with head-to-head set wins", () => {
        // Teams 1 and 2 both finish with 2 set wins, but 1 swept their meeting
        const teams = [team(2), team(1), team(3)]
        const matches = [
            setMatch(1, 2, [
                [25, 20],
                [25, 20]
            ]),
            setMatch(2, 3, [
                [25, 20],
                [25, 20]
            ])
        ]
        const standings = computeStandings(teams, matches)
        expect(standings[0].id).toBe(1)
        expect(standings[1].id).toBe(2)
        expect(standings[0].wins).toBe(2)
        expect(standings[1].wins).toBe(2)
    })

    it("breaks even head-to-head sets with head-to-head points", () => {
        // 1 and 2 split their meeting but 1 outscored 2 in it; each also
        // takes one set from a filler opponent so totals stay tied
        const teams = [team(2), team(1), team(3), team(4)]
        const matches = [
            setMatch(1, 2, [
                [25, 20],
                [23, 25]
            ]),
            setMatch(1, 3, [[25, 20]]),
            setMatch(2, 4, [[25, 20]])
        ]
        const standings = computeStandings(teams, matches)
        expect(standings[0].id).toBe(1)
        expect(standings[1].id).toBe(2)
    })

    it("breaks ties without head-to-head history using point differential", () => {
        // 1 and 2 never met; both 1-0 in sets, but 1 won by a wider margin
        const teams = [team(2), team(1), team(3), team(4)]
        const matches = [setMatch(1, 3, [[25, 5]]), setMatch(2, 4, [[25, 20]])]
        const standings = computeStandings(teams, matches)
        expect(standings[0].id).toBe(1)
        expect(standings[1].id).toBe(2)
    })

    it("breaks equal point differentials with total points scored", () => {
        const teams = [team(1), team(2), team(3), team(4)]
        const matches = [setMatch(1, 3, [[25, 20]]), setMatch(2, 4, [[30, 25]])]
        const standings = computeStandings(teams, matches)
        // Both +5 diff, but team 2 scored 30 points to team 1's 25
        expect(standings[0].id).toBe(2)
        expect(standings[1].id).toBe(1)
    })

    it("falls back to team number, then name, when no matches separate teams", () => {
        const byNumber = computeStandings(
            [team(2, "Bravo", 5), team(1, "Alpha", 3)],
            []
        )
        expect(byNumber.map((s) => s.id)).toEqual([1, 2])

        const byName = computeStandings(
            [team(2, "Zulu", null), team(1, "Alpha", null)],
            []
        )
        expect(byName.map((s) => s.name)).toEqual(["Alpha", "Zulu"])
    })
})

describe("rankDivision", () => {
    it("delegates to computeStandings over all weeks", () => {
        const teams = [team(1), team(2)]
        const matches = [
            setMatch(2, 1, [
                [25, 10],
                [25, 10]
            ])
        ]
        expect(rankDivision(teams, matches, teams.length)).toEqual(
            computeStandings(teams, matches)
        )
    })
})
