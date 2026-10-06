import { describe, expect, it } from "vitest"
import { parseSourceToken } from "@/lib/playoff-sources"
import { FOUR_TEAM_PLAYOFF, SIX_TEAM_PLAYOFF } from "@/lib/schedule-constants"
import {
    buildPlayoffDivision,
    collectSeeds,
    combinePlayoffRows,
    findChampionTeamId,
    findUserAnchor,
    makeEffectiveTeamResolver,
    type PlayoffMatchLine,
    type PlayoffMatchRow,
    type PlayoffMetaRow,
    playoffTemplateForTeamCount,
    withPlaceholderDivisions
} from "./division"
import { indexByMatchNum } from "./structure"
import { combined } from "./testing"

function matchRow(
    id: number,
    overrides: Partial<PlayoffMatchRow> = {}
): PlayoffMatchRow {
    return {
        id,
        week: 1,
        date: null,
        time: null,
        court: null,
        homeTeamId: null,
        awayTeamId: null,
        homeScore: null,
        awayScore: null,
        homeSet1Score: null,
        awaySet1Score: null,
        homeSet2Score: null,
        awaySet2Score: null,
        homeSet3Score: null,
        awaySet3Score: null,
        winnerTeamId: null,
        ...overrides
    }
}

function metaRow(
    id: number,
    matchNum: number,
    overrides: Partial<PlayoffMetaRow> = {}
): PlayoffMetaRow {
    return {
        id,
        week: 1,
        matchNum,
        matchId: null,
        bracket: null,
        homeSource: "TBD",
        awaySource: "TBD",
        nextMatchNum: null,
        nextLoserMatchNum: null,
        workTeamId: null,
        workSource: null,
        ...overrides
    }
}

describe("withPlaceholderDivisions", () => {
    it("adds 'Division <id>' after every real level and sorts by level", () => {
        const rows = withPlaceholderDivisions(
            [
                { id: 3, name: "BB", level: 2 },
                { id: 1, name: "AA", level: 1 }
            ],
            [1, 7, 3]
        )
        expect(rows).toEqual([
            { id: 1, name: "AA", level: 1 },
            { id: 3, name: "BB", level: 2 },
            { id: 7, name: "Division 7", level: 1006 }
        ])
    })
})

describe("playoffTemplateForTeamCount", () => {
    it("knows the four- and six-team templates only", () => {
        expect(playoffTemplateForTeamCount(4)).toBe(FOUR_TEAM_PLAYOFF)
        expect(playoffTemplateForTeamCount(6)).toBe(SIX_TEAM_PLAYOFF)
        expect(playoffTemplateForTeamCount(8)).toBeNull()
        expect(playoffTemplateForTeamCount(undefined)).toBeNull()
    })
})

describe("combinePlayoffRows", () => {
    it("joins meta onto its match, keeps unclaimed meta, and sorts by match number", () => {
        const combinedRows = combinePlayoffRows(
            [
                matchRow(100, { week: 3, homeTeamId: 1, awayTeamId: 2 }),
                matchRow(101, { week: 1, homeTeamId: 3 })
            ],
            [
                metaRow(1, 2, {
                    matchId: 101,
                    homeSource: "S1",
                    awaySource: "W1",
                    bracket: "winners",
                    nextMatchNum: 3,
                    workTeamId: 9
                }),
                // Second meta row for the same match: ignored for the join,
                // and (being unclaimed) shown as its own meta-only entry.
                metaRow(2, 5, { matchId: 101, homeSource: "L1" }),
                metaRow(3, 1, { homeSource: "S4", awaySource: "S5" })
            ],
            null
        )

        expect(combinedRows.map((m) => [m.key, m.matchNum, m.id])).toEqual([
            ["meta-3", 1, null],
            ["match-101", 2, 101],
            ["meta-2", 5, null],
            ["match-100", null, 100]
        ])

        const joined = combinedRows[1]
        expect(joined).toMatchObject({
            homeTeamId: 3,
            metaBracket: "winners",
            nextMatchNum: 3,
            workTeamId: 9,
            section: null,
            round: 1
        })
        expect(joined.homeSource).toEqual(parseSourceToken("S1"))
        expect(joined.awaySource).toEqual(parseSourceToken("W1"))

        // A match with no meta has no sources at all
        expect(combinedRows[3].homeSource.kind).toBe("none")
        expect(combinedRows[3].workSource.kind).toBe("none")
    })

    it("fills a null work_source from the template by match number", () => {
        const rows = combinePlayoffRows(
            [matchRow(100)],
            [
                metaRow(1, 2, { matchId: 100 }),
                metaRow(2, 5),
                metaRow(3, 6, { workSource: "S3" })
            ],
            SIX_TEAM_PLAYOFF
        )
        expect(rows.map((m) => m.workSource.normalized)).toEqual([
            "L1",
            "W2",
            "S3"
        ])

        const noTemplate = combinePlayoffRows([], [metaRow(1, 2)], null)
        expect(noTemplate[0].workSource.kind).toBe("none")
    })

    it("orders equal match numbers (unnumbered matches) chronologically", () => {
        const rows = combinePlayoffRows(
            [
                matchRow(1, { week: 2, time: "19:00" }),
                matchRow(2, { week: 1, time: "20:00" }),
                matchRow(3, { week: 1, time: "19:00", court: 2 }),
                matchRow(4, { week: 1, time: "19:00", court: 1 })
            ],
            [],
            null
        )
        expect(rows.map((m) => m.id)).toEqual([4, 3, 2, 1])
    })
})

describe("collectSeeds", () => {
    it("collects every seed, labelling those whose side has a team", () => {
        const { seedNumbers, seedLabelBySeed, seedTeamIdBySeed } = collectSeeds(
            [
                combined({ home: "S4", away: "S5", homeTeamId: 40 }),
                combined({ home: "S1", away: "W1", homeTeamId: 99 })
            ],
            new Map([[40, "#4 Digs"]])
        )
        expect([...seedNumbers]).toEqual([4, 5, 1])
        expect([...seedLabelBySeed.entries()]).toEqual([
            [4, "#4 Digs"],
            [1, "Team 99"]
        ])
        expect([...seedTeamIdBySeed.entries()]).toEqual([
            [4, 40],
            [1, 99]
        ])
    })

    it("lets a later match overwrite an earlier seed assignment", () => {
        const { seedTeamIdBySeed } = collectSeeds(
            [
                combined({ home: "S1", homeTeamId: 1 }),
                combined({ away: "S1", awayTeamId: 2 })
            ],
            new Map()
        )
        expect(seedTeamIdBySeed.get(1)).toBe(2)
    })
})

describe("makeEffectiveTeamResolver", () => {
    const matches = [
        combined({
            matchNum: 1,
            homeTeamId: 10,
            awayTeamId: 20,
            homeScore: 2,
            awayScore: 1
        }),
        combined({ matchNum: 2, homeTeamId: 30, awayTeamId: 40 }),
        combined({ matchNum: 3, homeTeamId: 30, winnerTeamId: 30 })
    ]
    const resolve = makeEffectiveTeamResolver(
        new Map([[1, 10]]),
        indexByMatchNum(matches)
    )
    const via = (token: string) => resolve(null, parseSourceToken(token))

    it("returns a stored team untouched", () => {
        expect(resolve(77, parseSourceToken("W2"))).toBe(77)
    })

    it("follows seeds and decided winner/loser references one level", () => {
        expect(via("S1")).toBe(10)
        expect(via("W1")).toBe(10)
        expect(via("L1")).toBe(20)
        expect(via("W3")).toBe(30)
    })

    it("promises nothing for undecided, unknown or half-known upstream matches", () => {
        expect(via("S2")).toBeNull()
        expect(via("W2")).toBeNull()
        expect(via("W9")).toBeNull()
        expect(via("L3")).toBeNull()
        expect(via("5")).toBeNull()
    })
})

describe("findChampionTeamId", () => {
    it("takes the deepest decided championship match", () => {
        const matches = [
            combined({
                matchNum: 9,
                section: "winners",
                round: 3,
                winnerTeamId: 5
            }),
            combined({
                matchNum: 10,
                section: "championship",
                round: 1,
                winnerTeamId: 1
            }),
            combined({
                matchNum: 11,
                section: "championship",
                round: 2,
                winnerTeamId: 2
            })
        ]
        expect(findChampionTeamId(matches)).toBe(2)
    })

    it("falls back to the first final when the reset is unplayed", () => {
        const matches = [
            combined({
                matchNum: 10,
                section: "championship",
                round: 1,
                winnerTeamId: 1
            }),
            combined({ matchNum: 11, section: "championship", round: 2 })
        ]
        expect(findChampionTeamId(matches)).toBe(1)
    })

    it("uses the winners section when there is no championship section", () => {
        const matches = [
            combined({
                matchNum: 1,
                section: "winners",
                round: 1,
                winnerTeamId: 7
            }),
            combined({
                matchNum: 3,
                section: "winners",
                round: 2,
                winnerTeamId: 8
            }),
            combined({
                matchNum: 2,
                section: "losers",
                round: 5,
                winnerTeamId: 9
            })
        ]
        expect(findChampionTeamId(matches)).toBe(8)
    })

    it("does not crown anyone from earlier sections while the final is unplayed", () => {
        const matches = [
            combined({
                matchNum: 7,
                section: "winners",
                round: 3,
                winnerTeamId: 1
            }),
            combined({ matchNum: 10, section: "championship", round: 1 })
        ]
        expect(findChampionTeamId(matches)).toBeNull()
    })
})

describe("findUserAnchor", () => {
    const line = (
        matchNum: number | null,
        week: number,
        teams: Partial<PlayoffMatchLine>
    ) =>
        ({
            matchNum,
            week,
            homeTeamId: null,
            awayTeamId: null,
            workTeamId: null,
            winnerTeamId: null,
            ...teams
        }) as PlayoffMatchLine

    it("picks the first undecided match the team plays or works", () => {
        const anchor = findUserAnchor(
            [
                line(1, 1, { homeTeamId: 5, winnerTeamId: 5 }),
                line(null, 1, { homeTeamId: 5 }),
                line(2, 1, { awayTeamId: 6 }),
                line(3, 2, { workTeamId: 5 }),
                line(4, 2, { homeTeamId: 5 })
            ],
            5
        )
        expect(anchor).toEqual({ matchNum: 3, week: 2 })
    })

    it("falls back to the last decided match, or nothing", () => {
        expect(
            findUserAnchor(
                [
                    line(1, 1, { homeTeamId: 5, winnerTeamId: 5 }),
                    line(4, 2, { awayTeamId: 5, winnerTeamId: 6 })
                ],
                5
            )
        ).toEqual({ matchNum: 4, week: 2 })
        expect(findUserAnchor([line(1, 1, { homeTeamId: 6 })], 5)).toEqual({
            matchNum: null,
            week: null
        })
    })
})

describe("buildPlayoffDivision", () => {
    // Four-team double elimination, played through the reset final.
    // Seeds: S1 Aces(1) S2 Blocks(2) S3 Cuts(3) S4 Digs(4)
    const teams = [
        { id: 1, number: 1, name: "Aces" },
        { id: 2, number: 2, name: "Blocks" },
        { id: 3, number: 3, name: "Cuts" },
        { id: 4, number: 4, name: "Digs" }
    ]
    const results: Record<number, [number, number, number | null]> = {
        // matchNum: [home, away, winner]
        1: [1, 4, 1],
        2: [2, 3, 3],
        3: [1, 3, 1],
        4: [4, 2, 2],
        5: [3, 2, 3],
        6: [1, 3, 3],
        7: [3, 1, null]
    }
    const matchRows = FOUR_TEAM_PLAYOFF.map((t) => {
        const [home, away, winner] = results[t.matchNum]
        return matchRow(100 + t.matchNum, {
            week: t.week,
            date: `2031-11-0${t.week}`,
            time: t.time || "19:00",
            court: 1,
            homeTeamId: home,
            awayTeamId: away,
            winnerTeamId: winner
        })
    })
    const metaRows = FOUR_TEAM_PLAYOFF.map((t) =>
        metaRow(t.matchNum, t.matchNum, {
            week: t.week,
            matchId: 100 + t.matchNum,
            bracket: t.bracket,
            homeSource: t.homeSeed,
            awaySource: t.awaySeed,
            workSource: t.workTeam,
            nextMatchNum: t.nextMatchNum,
            nextLoserMatchNum: t.nextLoserMatchNum
        })
    )
    const build = (userTeamId: number | null, userDivisionId: number | null) =>
        buildPlayoffDivision({
            division: { id: 8, name: "AA", level: 1 },
            teams,
            matchRows,
            metaRows,
            teamCount: 4,
            refByMatchId: new Map([[101, "Rita Ref"]]),
            userTeamId,
            userDivisionId
        })

    it("assembles seeds, sections, schedule, champion and bracket", () => {
        const division = build(null, null)

        expect(division).toMatchObject({ id: 8, name: "AA", level: 1 })
        expect(division.seeds.map((s) => [s.seed, s.teamLabel])).toEqual([
            [1, "#1 Aces"],
            [2, "#2 Blocks"],
            [3, "#3 Cuts"],
            [4, "#4 Digs"]
        ])
        expect(
            division.sections.map((s) => [
                s.label,
                s.rounds.map((r) => r.matches.map((m) => m.matchNum))
            ])
        ).toEqual([
            ["Winners Bracket", [[1, 2], [3]]],
            ["Losers Bracket", [[4], [5]]],
            ["Championship", [[6], [7]]]
        ])
        expect(division.scheduleMatches.map((m) => m.matchNum)).toEqual([
            1, 2, 3, 4, 5, 6, 7
        ])
        // #7 (the reset) is unplayed, so the first final's winner is champion
        expect(division.champion).toBe("#3 Cuts")
        expect(division.bracketMatches?.upper.map((m) => m.id)).toEqual([
            1, 2, 3, 6, 7
        ])
        expect(division.bracketMatches?.lower.map((m) => m.id)).toEqual([4, 5])
        expect(division.userAnchorMatchNum).toBeNull()
        expect(division.userAnchorWeek).toBeNull()

        const first = division.scheduleMatches[0]
        expect(first).toMatchObject({
            key: "match-101",
            homeLabel: "#1 Aces",
            awayLabel: "#4 Digs",
            winnerLabel: "#1 Aces",
            loserLabel: "#4 Digs",
            homeIsWinner: true,
            refName: "Rita Ref",
            workAssignmentLabel: "#2 Blocks",
            workTeamId: 2
        })
        expect(division.scheduleMatches[1].refName).toBeNull()
    })

    it("anchors the viewer only in their own division", () => {
        expect(build(3, 8)).toMatchObject({
            userAnchorMatchNum: 7,
            userAnchorWeek: 3
        })
        expect(build(3, 9)).toMatchObject({
            userAnchorMatchNum: null,
            userAnchorWeek: null
        })
    })
})
