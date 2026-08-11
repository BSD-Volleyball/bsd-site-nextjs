import { describe, expect, it } from "vitest"
import {
    buildMatchRosters,
    computePlayerElo,
    ELO_BASE,
    ELO_CARRYOVER_GAP_DECAY,
    ELO_CARRYOVER_RETENTION,
    ELO_DIVISION_STEP,
    ELO_K_FACTOR,
    ELO_LOWEST_DIVISION_LEVEL,
    expectedScore,
    actualScore,
    orderMatches,
    rosterKey,
    subAppearanceKey,
    type DraftRosterRow,
    type EloMatchInput,
    type MatchSubRow,
    type PermanentSubRow
} from "@/lib/player-elo"

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

// A match reported per set: each entry is [homePoints, awayPoints]
function setMatch(
    id: number,
    homeTeamId: number,
    awayTeamId: number,
    sets: Array<[number, number]>,
    overrides: Partial<EloMatchInput> = {}
): EloMatchInput {
    const [set1, set2, set3] = sets
    return eloMatch({
        id,
        homeTeamId,
        awayTeamId,
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

const level1Seed =
    ELO_BASE + (ELO_LOWEST_DIVISION_LEVEL - 1) * ELO_DIVISION_STEP

describe("expectedScore", () => {
    it("gives 0.5 for equal ratings", () => {
        expect(expectedScore(1200, 1200)).toBe(0.5)
    })

    it("is symmetric: E(a,b) + E(b,a) = 1", () => {
        expect(
            expectedScore(1400, 1100) + expectedScore(1100, 1400)
        ).toBeCloseTo(1)
    })

    it("favors the higher-rated side", () => {
        expect(expectedScore(1400, 1100)).toBeGreaterThan(0.5)
        expect(expectedScore(1100, 1400)).toBeLessThan(0.5)
    })
})

describe("actualScore", () => {
    it("uses the share of sets won", () => {
        expect(
            actualScore(
                setMatch(1, 10, 20, [
                    [25, 20],
                    [25, 15]
                ])
            )
        ).toBe(1)
        expect(
            actualScore(
                setMatch(1, 10, 20, [
                    [25, 20],
                    [20, 25],
                    [15, 10]
                ])
            )
        ).toBeCloseTo(2 / 3)
    })

    it("falls back to legacy match-level scores when no sets exist", () => {
        expect(
            actualScore(
                eloMatch({
                    homeTeamId: 10,
                    awayTeamId: 20,
                    homeScore: 2,
                    awayScore: 1
                })
            )
        ).toBeCloseTo(2 / 3)
    })

    it("falls back to the winner when no scores exist", () => {
        expect(
            actualScore(
                eloMatch({ homeTeamId: 10, awayTeamId: 20, winner: 10 })
            )
        ).toBe(1)
        expect(
            actualScore(
                eloMatch({ homeTeamId: 10, awayTeamId: 20, winner: 20 })
            )
        ).toBe(0)
    })

    it("returns null when there is no usable result", () => {
        expect(actualScore(eloMatch({ homeTeamId: 10, awayTeamId: 20 }))).toBe(
            null
        )
    })
})

describe("orderMatches", () => {
    it("orders by season, week, date, then id", () => {
        const matches = [
            eloMatch({ id: 4, seasonId: 2, week: 1 }),
            eloMatch({ id: 3, seasonId: 1, week: 2, date: "2025-01-20" }),
            eloMatch({ id: 2, seasonId: 1, week: 2, date: "2025-01-19" }),
            eloMatch({ id: 1, seasonId: 1, week: 3 })
        ]
        expect(orderMatches(matches).map((m) => m.id)).toEqual([2, 3, 1, 4])
    })

    it("sorts null dates after dated matches within the same week", () => {
        const matches = [
            eloMatch({ id: 1, week: 1, date: null }),
            eloMatch({ id: 2, week: 1, date: "2025-01-19" })
        ]
        expect(orderMatches(matches).map((m) => m.id)).toEqual([2, 1])
    })

    it("breaks full ties deterministically by id", () => {
        const matches = [
            eloMatch({ id: 2, week: 1 }),
            eloMatch({ id: 1, week: 1 })
        ]
        expect(orderMatches(matches).map((m) => m.id)).toEqual([1, 2])
    })
})

describe("computePlayerElo", () => {
    it("moves every rostered player by K/2 for a sweep between equal rosters", () => {
        const match = setMatch(1, 10, 20, [
            [25, 20],
            [25, 15]
        ])
        const result = computePlayerElo(
            [match],
            rosters([
                [1, 10, ["a", "b"]],
                [1, 20, ["c", "d"]]
            ])
        )
        expect(result.ratings.get("a")).toBe(level1Seed + ELO_K_FACTOR / 2)
        expect(result.ratings.get("b")).toBe(level1Seed + ELO_K_FACTOR / 2)
        expect(result.ratings.get("c")).toBe(level1Seed - ELO_K_FACTOR / 2)
        expect(result.ratings.get("d")).toBe(level1Seed - ELO_K_FACTOR / 2)
    })

    it("conserves total rating for equal-sized rosters", () => {
        const matches = [
            setMatch(1, 10, 20, [
                [25, 20],
                [20, 25],
                [15, 10]
            ]),
            setMatch(2, 20, 10, [[25, 23]], { week: 2 })
        ]
        const result = computePlayerElo(
            matches,
            rosters([
                [1, 10, ["a", "b"]],
                [1, 20, ["c", "d"]],
                [2, 20, ["c", "d"]],
                [2, 10, ["a", "b"]]
            ])
        )
        const total = ["a", "b", "c", "d"].reduce(
            (sum, id) => sum + (result.ratings.get(id) ?? 0),
            0
        )
        expect(total).toBeCloseTo(4 * level1Seed)
    })

    it("rewards an upset more than an expected win", () => {
        // Match 1 raises team A above team B; the rematch outcomes differ
        const buildHistory = (rematchWinnerHome: boolean) => {
            const rematch = rematchWinnerHome
                ? setMatch(2, 10, 20, [[25, 20]], { week: 2 })
                : setMatch(2, 20, 10, [[25, 20]], { week: 2 })
            return computePlayerElo(
                [setMatch(1, 10, 20, [[25, 20]]), rematch],
                rosters([
                    [1, 10, ["a"]],
                    [1, 20, ["b"]],
                    [2, 10, ["a"]],
                    [2, 20, ["b"]]
                ])
            )
        }
        const expectedWin = buildHistory(true)
        const upset = buildHistory(false)

        const expectedGain =
            (expectedWin.histories.get("a") ?? [])[1]?.delta ?? 0
        const upsetGain = (upset.histories.get("b") ?? [])[1]?.delta ?? 0
        expect(expectedGain).toBeGreaterThan(0)
        expect(upsetGain).toBeGreaterThan(expectedGain)
    })

    it("moves ratings less for a 2-1 result than a 2-0 sweep", () => {
        const run = (sets: Array<[number, number]>) =>
            computePlayerElo(
                [setMatch(1, 10, 20, sets)],
                rosters([
                    [1, 10, ["a"]],
                    [1, 20, ["b"]]
                ])
            )
        const sweep = run([
            [25, 20],
            [25, 15]
        ])
        const split = run([
            [25, 20],
            [20, 25],
            [15, 10]
        ])
        const sweepDelta = sweep.histories.get("a")?.[0]?.delta ?? 0
        const splitDelta = split.histories.get("a")?.[0]?.delta ?? 0
        expect(splitDelta).toBeGreaterThan(0)
        expect(sweepDelta).toBeGreaterThan(splitDelta)
    })

    it("skips matches with no usable result or missing rosters", () => {
        const unusable = eloMatch({ id: 1, homeTeamId: 10, awayTeamId: 20 })
        const noRoster = setMatch(2, 30, 40, [[25, 10]], { week: 2 })
        const result = computePlayerElo(
            [unusable, noRoster],
            rosters([
                [1, 10, ["a"]],
                [1, 20, ["b"]]
            ])
        )
        expect(result.ratings.size).toBe(0)
        expect(result.histories.size).toBe(0)
    })

    it("seeds newcomers higher for stronger (lower-level) divisions", () => {
        const result = computePlayerElo(
            [
                setMatch(1, 10, 20, [[25, 20]], { divisionLevel: 1 }),
                setMatch(2, 30, 40, [[25, 20]], {
                    divisionLevel: ELO_LOWEST_DIVISION_LEVEL,
                    week: 2
                })
            ],
            rosters([
                [1, 10, ["top-a"]],
                [1, 20, ["top-b"]],
                [2, 30, ["low-a"]],
                [2, 40, ["low-b"]]
            ])
        )
        const topSeed =
            ELO_BASE + (ELO_LOWEST_DIVISION_LEVEL - 1) * ELO_DIVISION_STEP
        const lowSeed = ELO_BASE
        expect(topSeed).toBeGreaterThan(lowSeed)
        expect(result.histories.get("top-a")?.[0]?.ratingBefore).toBe(topSeed)
        expect(result.histories.get("low-a")?.[0]?.ratingBefore).toBe(lowSeed)
    })

    it("carries a player's rating into a new division within a season instead of re-seeding", () => {
        const result = computePlayerElo(
            [
                setMatch(1, 10, 20, [[25, 20]], { divisionLevel: 1 }),
                setMatch(2, 30, 40, [[25, 20]], {
                    divisionLevel: 2,
                    week: 2
                })
            ],
            rosters([
                [1, 10, ["a"]],
                [1, 20, ["b"]],
                [2, 30, ["a"]],
                [2, 40, ["newcomer"]]
            ])
        )
        const firstMatch = result.histories.get("a")?.[0]
        const secondMatch = result.histories.get("a")?.[1]
        expect(secondMatch?.ratingBefore).toBe(firstMatch?.ratingAfter)
        expect(result.histories.get("newcomer")?.[0]?.ratingBefore).toBe(
            ELO_BASE + (ELO_LOWEST_DIVISION_LEVEL - 2) * ELO_DIVISION_STEP
        )
    })

    it("processes matches chronologically regardless of input order", () => {
        const first = setMatch(1, 10, 20, [[25, 20]], { week: 1 })
        const second = setMatch(2, 20, 10, [[25, 20]], { week: 2 })
        const result = computePlayerElo(
            [second, first],
            rosters([
                [1, 10, ["a"]],
                [1, 20, ["b"]],
                [2, 20, ["b"]],
                [2, 10, ["a"]]
            ])
        )
        const history = result.histories.get("a") ?? []
        expect(history.map((h) => h.matchId)).toEqual([1, 2])
        expect(history[1].ratingBefore).toBe(history[0].ratingAfter)
    })

    it("counts rated matches per player and flags playoffs in history", () => {
        const result = computePlayerElo(
            [
                setMatch(1, 10, 20, [[25, 20]]),
                setMatch(2, 10, 20, [[25, 20]], { week: 2, playoff: true })
            ],
            rosters([
                [1, 10, ["a"]],
                [1, 20, ["b"]],
                [2, 10, ["a"]],
                [2, 20, ["b"]]
            ])
        )
        expect(result.matchCounts.get("a")).toBe(2)
        expect(result.histories.get("a")?.[1]?.playoff).toBe(true)
    })

    describe("season carryover", () => {
        const sweep: Array<[number, number]> = [
            [25, 20],
            [25, 15]
        ]
        // A sweep between fresh equal single-player rosters moves each by K/2
        const seasonOne = setMatch(1, 10, 20, sweep)
        const afterWin = level1Seed + ELO_K_FACTOR / 2
        const afterLoss = level1Seed - ELO_K_FACTOR / 2
        const retained = (carried: number, retention: number) =>
            retention * carried + (1 - retention) * level1Seed

        it("blends toward the division seed across contiguous seasons", () => {
            const result = computePlayerElo(
                [seasonOne, setMatch(2, 10, 20, sweep, { seasonId: 2 })],
                rosters([
                    [1, 10, ["a"]],
                    [1, 20, ["b"]],
                    [2, 10, ["a"]],
                    [2, 20, ["b"]]
                ])
            )
            expect(result.histories.get("a")?.[1]?.ratingBefore).toBeCloseTo(
                retained(afterWin, ELO_CARRYOVER_RETENTION)
            )
            expect(result.histories.get("b")?.[1]?.ratingBefore).toBeCloseTo(
                retained(afterLoss, ELO_CARRYOVER_RETENTION)
            )
        })

        it("applies the blend before computing the expected score", () => {
            const result = computePlayerElo(
                [seasonOne, setMatch(2, 10, 20, sweep, { seasonId: 2 })],
                rosters([
                    [1, 10, ["a"]],
                    [1, 20, ["b"]],
                    [2, 10, ["a"]],
                    [2, 20, ["b"]]
                ])
            )
            const aBefore = retained(afterWin, ELO_CARRYOVER_RETENTION)
            const bBefore = retained(afterLoss, ELO_CARRYOVER_RETENTION)
            expect(result.histories.get("a")?.[1]?.delta).toBeCloseTo(
                ELO_K_FACTOR * (1 - expectedScore(aBefore, bBefore))
            )
        })

        it("shifts further toward the seed per missed season", () => {
            const result = computePlayerElo(
                [
                    seasonOne,
                    setMatch(2, 30, 40, sweep, { seasonId: 2 }),
                    setMatch(3, 10, 20, sweep, { seasonId: 3 })
                ],
                rosters([
                    [1, 10, ["a"]],
                    [1, 20, ["b"]],
                    [2, 30, ["c"]],
                    [2, 40, ["d"]],
                    [3, 10, ["a"]],
                    [3, 20, ["b"]]
                ])
            )
            const retention = ELO_CARRYOVER_RETENTION - ELO_CARRYOVER_GAP_DECAY
            expect(result.histories.get("a")?.[1]?.ratingBefore).toBeCloseTo(
                retained(afterWin, retention)
            )
        })

        it("fully reseeds into the returning division after nine missed seasons", () => {
            const filler = Array.from({ length: 9 }, (_, i) =>
                setMatch(2 + i, 30, 40, sweep, { seasonId: 2 + i })
            )
            const entries: Array<[number, number, string[]]> = [
                [1, 10, ["a"]],
                [1, 20, ["b"]],
                [11, 10, ["a"]],
                [11, 20, ["e"]]
            ]
            for (const m of filler) {
                entries.push([m.id, 30, ["c"]], [m.id, 40, ["d"]])
            }
            const result = computePlayerElo(
                [
                    seasonOne,
                    ...filler,
                    setMatch(11, 10, 20, sweep, {
                        seasonId: 11,
                        divisionLevel: 3
                    })
                ],
                rosters(entries)
            )
            const level3Seed =
                ELO_BASE + (ELO_LOWEST_DIVISION_LEVEL - 3) * ELO_DIVISION_STEP
            expect(result.histories.get("a")?.[1]?.ratingBefore).toBeCloseTo(
                level3Seed
            )
        })

        it("seeds a newcomer appearing in a later season without blending", () => {
            const result = computePlayerElo(
                [seasonOne, setMatch(2, 10, 20, sweep, { seasonId: 2 })],
                rosters([
                    [1, 10, ["a"]],
                    [1, 20, ["b"]],
                    [2, 10, ["a"]],
                    [2, 20, ["newbie"]]
                ])
            )
            expect(result.histories.get("newbie")?.[0]?.ratingBefore).toBe(
                level1Seed
            )
        })

        it("measures gaps by season ordinal, not seasonId arithmetic", () => {
            const result = computePlayerElo(
                [
                    setMatch(1, 10, 20, sweep, { seasonId: 5 }),
                    setMatch(2, 10, 20, sweep, { seasonId: 17 })
                ],
                rosters([
                    [1, 10, ["a"]],
                    [1, 20, ["b"]],
                    [2, 10, ["a"]],
                    [2, 20, ["b"]]
                ])
            )
            expect(result.histories.get("a")?.[1]?.ratingBefore).toBeCloseTo(
                retained(afterWin, ELO_CARRYOVER_RETENTION)
            )
        })

        it("blends only once per season boundary", () => {
            const result = computePlayerElo(
                [
                    seasonOne,
                    setMatch(2, 10, 20, sweep, { seasonId: 2 }),
                    setMatch(3, 10, 20, sweep, { seasonId: 2, week: 2 })
                ],
                rosters([
                    [1, 10, ["a"]],
                    [1, 20, ["b"]],
                    [2, 10, ["a"]],
                    [2, 20, ["b"]],
                    [3, 10, ["a"]],
                    [3, 20, ["b"]]
                ])
            )
            const history = result.histories.get("a") ?? []
            expect(history[2]?.ratingBefore).toBe(history[1]?.ratingAfter)
        })

        it("does not re-anchor per-match subs", () => {
            const result = computePlayerElo(
                [seasonOne, setMatch(2, 10, 20, sweep, { seasonId: 2 })],
                rosters([
                    [1, 10, ["a"]],
                    [1, 20, ["b"]],
                    [2, 10, ["a"]],
                    [2, 20, ["x"]]
                ]),
                {},
                new Set([subAppearanceKey(2, "a")])
            )
            const history = result.histories.get("a") ?? []
            expect(history[1]?.ratingBefore).toBe(afterWin)
            expect(history[1]?.delta).toBeGreaterThan(0)
        })

        it("counts a sub-only season as played when measuring the gap", () => {
            const result = computePlayerElo(
                [
                    seasonOne,
                    setMatch(2, 10, 20, sweep, { seasonId: 2 }),
                    setMatch(3, 10, 20, sweep, { seasonId: 3 })
                ],
                rosters([
                    [1, 10, ["a"]],
                    [1, 20, ["b"]],
                    [2, 10, ["a"]],
                    [2, 20, ["c"]],
                    [3, 10, ["a"]],
                    [3, 20, ["d"]]
                ]),
                {},
                new Set([subAppearanceKey(2, "a")])
            )
            const history = result.histories.get("a") ?? []
            const afterSub = history[1]?.ratingAfter ?? 0
            expect(history[2]?.ratingBefore).toBeCloseTo(
                retained(afterSub, ELO_CARRYOVER_RETENTION)
            )
        })

        it("anchors at the drafted debut even after subbing earlier that season", () => {
            const result = computePlayerElo(
                [
                    seasonOne,
                    setMatch(2, 10, 20, sweep, { seasonId: 2 }),
                    setMatch(3, 10, 20, sweep, { seasonId: 2, week: 2 })
                ],
                rosters([
                    [1, 10, ["a"]],
                    [1, 20, ["b"]],
                    [2, 10, ["a"]],
                    [2, 20, ["c"]],
                    [3, 10, ["a"]],
                    [3, 20, ["d"]]
                ]),
                {},
                new Set([subAppearanceKey(2, "a")])
            )
            const history = result.histories.get("a") ?? []
            const afterSub = history[1]?.ratingAfter ?? 0
            expect(history[2]?.ratingBefore).toBeCloseTo(
                retained(afterSub, ELO_CARRYOVER_RETENTION)
            )
        })
    })
})

describe("buildMatchRosters", () => {
    const draftRows: DraftRosterRow[] = [
        { draftId: 100, teamId: 10, userId: "u1" },
        { draftId: 101, teamId: 10, userId: "u2" },
        { draftId: 102, teamId: 20, userId: "u3" }
    ]
    const m1 = setMatch(1, 10, 20, [[25, 20]], { date: "2025-01-10" })
    const m2 = setMatch(2, 10, 20, [[25, 20]], {
        date: "2025-01-20",
        week: 2
    })

    it("uses the drafted roster when there are no substitutions", () => {
        const map = buildMatchRosters([m1], draftRows, [], [])
        expect(map.get(rosterKey(1, 10))?.sort()).toEqual(["u1", "u2"])
        expect(map.get(rosterKey(1, 20))).toEqual(["u3"])
    })

    it("applies permanent subs only from their effective date onward", () => {
        const subs: PermanentSubRow[] = [
            {
                id: 1,
                originalDraft: 100,
                subUser: "u4",
                effectiveAt: new Date("2025-01-15T12:00:00Z")
            }
        ]
        const map = buildMatchRosters([m1, m2], draftRows, subs, [])
        expect(map.get(rosterKey(1, 10))?.sort()).toEqual(["u1", "u2"])
        expect(map.get(rosterKey(2, 10))?.sort()).toEqual(["u2", "u4"])
    })

    it("counts a same-day permanent sub as playing that match", () => {
        const subs: PermanentSubRow[] = [
            {
                id: 1,
                originalDraft: 100,
                subUser: "u4",
                effectiveAt: new Date("2025-01-10T18:00:00Z")
            }
        ]
        const map = buildMatchRosters([m1], draftRows, subs, [])
        expect(map.get(rosterKey(1, 10))?.sort()).toEqual(["u2", "u4"])
    })

    it("follows chained permanent subs to the last link before the match", () => {
        const subs: PermanentSubRow[] = [
            {
                id: 1,
                originalDraft: 100,
                subUser: "u4",
                effectiveAt: new Date("2025-01-05T00:00:00Z")
            },
            {
                id: 2,
                originalDraft: 100,
                subUser: "u5",
                effectiveAt: new Date("2025-01-15T00:00:00Z")
            }
        ]
        const map = buildMatchRosters([m1, m2], draftRows, subs, [])
        expect(map.get(rosterKey(1, 10))?.sort()).toEqual(["u2", "u4"])
        expect(map.get(rosterKey(2, 10))?.sort()).toEqual(["u2", "u5"])
    })

    it("applies the full sub chain when the match has no date", () => {
        const undated = setMatch(3, 10, 20, [[25, 20]], { week: 3 })
        const subs: PermanentSubRow[] = [
            {
                id: 1,
                originalDraft: 100,
                subUser: "u4",
                effectiveAt: new Date("2025-01-05T00:00:00Z")
            },
            {
                id: 2,
                originalDraft: 100,
                subUser: "u5",
                effectiveAt: new Date("2025-01-15T00:00:00Z")
            }
        ]
        const map = buildMatchRosters([undated], draftRows, subs, [])
        expect(map.get(rosterKey(3, 10))?.sort()).toEqual(["u2", "u5"])
    })

    it("swaps in per-match subs for that match only", () => {
        const matchSubs: MatchSubRow[] = [
            { matchId: 1, teamId: 10, originalUser: "u2", subUser: "u6" }
        ]
        const map = buildMatchRosters([m1, m2], draftRows, [], matchSubs)
        expect(map.get(rosterKey(1, 10))?.sort()).toEqual(["u1", "u6"])
        expect(map.get(rosterKey(2, 10))?.sort()).toEqual(["u1", "u2"])
    })

    it("lets a match sub replace the active player of a permanently subbed slot", () => {
        const subs: PermanentSubRow[] = [
            {
                id: 1,
                originalDraft: 100,
                subUser: "u4",
                effectiveAt: new Date("2025-01-05T00:00:00Z")
            }
        ]
        const matchSubs: MatchSubRow[] = [
            { matchId: 2, teamId: 10, originalUser: "u4", subUser: "u6" }
        ]
        const map = buildMatchRosters([m2], draftRows, subs, matchSubs)
        expect(map.get(rosterKey(2, 10))?.sort()).toEqual(["u2", "u6"])
    })

    it("still adds the sub when the named original player is absent", () => {
        const matchSubs: MatchSubRow[] = [
            { matchId: 1, teamId: 10, originalUser: "gone", subUser: "u6" }
        ]
        const map = buildMatchRosters([m1], draftRows, [], matchSubs)
        expect(map.get(rosterKey(1, 10))?.sort()).toEqual(["u1", "u2", "u6"])
    })
})
