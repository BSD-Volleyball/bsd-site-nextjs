import { describe, expect, it } from "vitest"
import { buildHomeworkRoundMaps } from "./draft-round-maps"
import {
    type CaptainInfo,
    type DraftPrepSignup,
    type DraftPrepTeamRow,
    type PlayerRow,
    type TeamInfo,
    buildConsideredButUndrafted,
    buildPairDifferentials,
    buildPlayerRows,
    buildTeamInfos,
    captain2IdsToLoad,
    groupDraftHistory,
    indexHomework,
    resolveDivisionHierarchy
} from "./draft-prep"
import { GHOST_CAPTAIN_ID } from "./ghost-captain"

function signup(
    userId: string,
    overrides: Partial<DraftPrepSignup> = {}
): DraftPrepSignup {
    return {
        userId,
        firstName: userId.toUpperCase(),
        lastName: `Last-${userId}`,
        preferredName: null,
        male: true,
        pairPick: null,
        ...overrides
    }
}

function captain(userId: string, teamId: number): CaptainInfo {
    return {
        userId,
        displayName: userId,
        lastName: `Last-${userId}`,
        email: `${userId}@x.test`,
        teamId
    }
}

function team(
    teamId: number,
    captain1: string,
    captain2: string | null = null
): TeamInfo {
    return {
        teamId,
        teamName: `T${teamId}`,
        teamNumber: teamId,
        captain1: captain(captain1, teamId),
        captain1Completed: false,
        captain2: captain2 ? captain(captain2, teamId) : null,
        captain2Completed: false,
        coachesTotal: captain2 ? 2 : 1,
        coachesCompleted: 0
    }
}

function teamRow(
    teamId: number,
    captainId: string,
    captain2Id: string | null = null
): DraftPrepTeamRow {
    return {
        teamId,
        teamName: `T${teamId}`,
        teamNumber: teamId,
        captainId,
        captain2Id,
        c1FirstName: `F-${captainId}`,
        c1LastName: `L-${captainId}`,
        c1PreferredName: null,
        c1Email: `${captainId}@x.test`
    }
}

const hw = (
    captainId: string,
    playerId: string,
    round: number,
    isMaleTab = true
) => ({ captainId, playerId, round, isMaleTab })

describe("resolveDivisionHierarchy", () => {
    const rows = [
        { id: 10, name: "AA", level: 1 },
        { id: 20, name: "A", level: 2 },
        { id: 30, name: "BB", level: 3 }
    ]

    it("returns the divisions above and the immediately higher one", () => {
        expect(resolveDivisionHierarchy(rows, 30)).toEqual({
            currentDivisionConfig: rows[2],
            higherDivisionRows: [rows[0], rows[1]],
            immediatelyHigherDivision: rows[1]
        })
    })

    it("has no higher division for the top division", () => {
        expect(resolveDivisionHierarchy(rows, 10)).toEqual({
            currentDivisionConfig: rows[0],
            higherDivisionRows: [],
            immediatelyHigherDivision: null
        })
    })

    it("returns nothing for a division outside the season", () => {
        expect(resolveDivisionHierarchy(rows, 99)).toEqual({
            currentDivisionConfig: null,
            higherDivisionRows: [],
            immediatelyHigherDivision: null
        })
    })
})

describe("indexHomework", () => {
    it("keeps the first pick per captain+player and counts every row", () => {
        const index = indexHomework(
            [
                hw("c1", "p1", 2),
                hw("c1", "p1", 5, false),
                hw("c1", "p2", 1),
                hw("c2", "p1", 1)
            ],
            3
        )
        expect(index.picks.get("c1:p1")).toEqual({ round: 2, isMaleTab: true })
        expect(index.picks.get("c2:p1")).toEqual({ round: 1, isMaleTab: true })
        expect([...index.captainsFullyCompleted]).toEqual(["c1"])
    })

    it("lets nobody complete when the threshold is 0", () => {
        const index = indexHomework([hw("c1", "p1", 1)], 0)
        expect(index.captainsFullyCompleted.size).toBe(0)
    })
})

describe("captain2IdsToLoad / buildTeamInfos", () => {
    const rows = [
        teamRow(1, "c1", "c2"),
        teamRow(2, "c3", GHOST_CAPTAIN_ID),
        teamRow(3, GHOST_CAPTAIN_ID),
        teamRow(4, "c4", "missing")
    ]

    it("loads only real co-captains", () => {
        expect(captain2IdsToLoad(rows)).toEqual(["c2", "missing"])
    })

    it("skips ghost teams and ghost or unknown co-captains", () => {
        const { teams, captains } = buildTeamInfos(
            rows,
            new Map([
                [
                    "c2",
                    {
                        firstName: "Cora",
                        lastName: "Two",
                        preferredName: "Coco",
                        email: "c2@x.test"
                    }
                ]
            ]),
            new Set(["c2", "c3"])
        )
        expect(captains.map((c) => [c.userId, c.teamId])).toEqual([
            ["c1", 1],
            ["c2", 1],
            ["c3", 2],
            ["c4", 4]
        ])
        expect(captains[1].displayName).toBe("Coco")
        expect(
            teams.map((t) => [
                t.teamId,
                t.captain2?.userId ?? null,
                t.captain1Completed,
                t.captain2Completed,
                t.coachesTotal,
                t.coachesCompleted
            ])
        ).toEqual([
            [1, "c2", false, true, 2, 1],
            [2, null, true, false, 1, 1],
            [4, null, false, false, 1, 0]
        ])
    })
})

describe("groupDraftHistory", () => {
    it("groups rounds by user then season", () => {
        const map = groupDraftHistory([
            { userId: "p1", seasonId: 5, round: 2 },
            { userId: "p1", seasonId: 4, round: 3 },
            { userId: "p2", seasonId: 5, round: 7 }
        ])
        expect([...map.get("p1")!.entries()]).toEqual([
            [5, 2],
            [4, 3]
        ])
        expect([...map.get("p2")!.entries()]).toEqual([[5, 7]])
    })
})

describe("buildPlayerRows", () => {
    const roundMaps = buildHomeworkRoundMaps("5-3")

    function rows(
        signups: DraftPrepSignup[],
        teams: TeamInfo[],
        homeworkRows: ReturnType<typeof hw>[],
        completed: string[],
        draftHistory = new Map<string, Map<number, number>>(),
        priorSeasonIds: number[] = []
    ): PlayerRow[] {
        const homework = indexHomework(homeworkRows, 1)
        homework.captainsFullyCompleted.clear()
        for (const c of completed) homework.captainsFullyCompleted.add(c)
        return buildPlayerRows(signups, {
            teams,
            homework,
            roundMaps,
            draftHistory,
            priorSeasonIds
        })
    }

    it("averages co-captains by who completed their homework", () => {
        const teams = [
            team(1, "a1", "a2"), // both complete
            team(2, "b1", "b2"), // only captain1
            team(3, "c1", "c2"), // only captain2
            team(4, "d1", "d2") // neither
        ]
        // male rounds 1→1, 2→2, 3→4, 4→6
        const homework = [
            hw("a1", "p", 1),
            hw("a2", "p", 3),
            hw("b1", "p", 2),
            hw("b2", "p", 4),
            hw("c1", "p", 1),
            hw("c2", "p", 4),
            hw("d1", "p", 1),
            hw("d2", "p", 2)
        ]
        const [player] = rows([signup("p")], teams, homework, [
            "a1",
            "a2",
            "b1",
            "c2"
        ])
        expect(player.teamRounds).toEqual([
            { teamId: 1, mappedRound: 2.5, teamCompletedHomework: true },
            { teamId: 2, mappedRound: 2, teamCompletedHomework: true },
            { teamId: 3, mappedRound: 6, teamCompletedHomework: true },
            { teamId: 4, mappedRound: 1.5, teamCompletedHomework: false }
        ])
        // Only teams with a completed captain count toward the average
        expect(player.captainAverage).toBeCloseTo((2.5 + 2 + 6) / 3)
        expect(player.draftHistoryAverage).toBeNull()
        expect(player.recommendedRound).toBe(player.captainAverage)
    })

    it("treats a pick on the wrong gender tab as unplaced", () => {
        const result = rows(
            [
                signup("m", { male: true }),
                signup("f", { male: false }),
                signup("n", { male: null })
            ],
            [team(1, "c")],
            [
                hw("c", "m", 1, false),
                hw("c", "f", 1, false),
                hw("c", "n", 2, false)
            ],
            ["c"]
        )
        // m is filtered out (unplaced everywhere); null gender reads as non-male
        expect(
            result.map((p) => [p.userId, p.teamRounds[0].mappedRound])
        ).toEqual([
            ["f", 3],
            ["n", 5]
        ])
    })

    it("blends captain rounds with weighted prior draft rounds", () => {
        const [player] = rows(
            [signup("p")],
            [team(1, "c")],
            [hw("c", "p", 1)],
            ["c"],
            new Map([
                [
                    "p",
                    new Map([
                        [9, 2],
                        [7, 5],
                        [3, 8] // outside the window
                    ])
                ]
            ]),
            [9, 8, 7]
        )
        // (2×3 + 5×1) / (3 + 1)
        expect(player.draftHistoryAverage).toBe(11 / 4)
        expect(player.recommendedRound).toBe(1 * 0.6 + (11 / 4) * 0.4)
    })

    it("uses 9 when no team completed, flags pair picks, sorts by round then last name", () => {
        const result = rows(
            [
                signup("z", { lastName: "Zed", pairPick: "a" }),
                signup("a", { lastName: "Able" }),
                signup("b", { lastName: "Baker" })
            ],
            [team(1, "c")],
            [hw("c", "z", 1), hw("c", "a", 2), hw("c", "b", 1)],
            []
        )
        expect(
            result.map((p) => [p.userId, p.captainAverage, p.isPairPick])
        ).toEqual([
            ["a", 9, true],
            ["b", 9, false],
            ["z", 9, false]
        ])
    })
})

describe("buildPairDifferentials", () => {
    function player(userId: string, recommendedRound: number): PlayerRow {
        return {
            userId,
            displayName: userId,
            lastName: `Last-${userId}`,
            isMale: true,
            isPairPick: false,
            teamRounds: [],
            captainAverage: recommendedRound,
            draftHistoryAverage: null,
            recommendedRound
        }
    }

    it("emits one entry per pair with the higher-rated player first", () => {
        const signups = [
            signup("a", { pairPick: "b", lastName: "Last-a" }),
            signup("b", { pairPick: "a", preferredName: "Bee" }),
            signup("c", { pairPick: "cap" }),
            signup("cap"),
            signup("d", { pairPick: "nobody" }),
            signup("e", { pairPick: "f" }),
            signup("f")
        ]
        const result = buildPairDifferentials(
            [
                player("a", 5),
                player("b", 2),
                player("c", 3),
                player("cap", 6),
                player("d", 1),
                player("e", 4)
            ],
            signups,
            [captain("cap", 1)]
        )
        expect(result).toEqual([
            {
                player1UserId: "b",
                player1DisplayName: "Bee",
                player1LastName: "Last-b",
                player1Round: 2,
                player2UserId: "a",
                player2DisplayName: "a",
                player2LastName: "Last-a",
                player2Round: 5,
                captainIsLower: false
            },
            {
                player1UserId: "c",
                player1DisplayName: "c",
                player1LastName: "Last-c",
                player1Round: 3,
                player2UserId: "cap",
                player2DisplayName: "CAP",
                player2LastName: "Last-cap",
                player2Round: 6,
                captainIsLower: true
            },
            // f is unrated, so it counts as round 9
            {
                player1UserId: "e",
                player1DisplayName: "e",
                player1LastName: "Last-e",
                player1Round: 4,
                player2UserId: "f",
                player2DisplayName: "F",
                player2LastName: "Last-f",
                player2Round: 9,
                captainIsLower: false
            }
        ])
    })

    it("breaks equal rounds by user id", () => {
        const [pair] = buildPairDifferentials(
            [player("y", 3), player("x", 3)],
            [signup("y", { pairPick: "x" }), signup("x")],
            []
        )
        expect([pair.player1UserId, pair.player2UserId]).toEqual(["x", "y"])
    })
})

describe("buildConsideredButUndrafted", () => {
    const higherDivisionRows = [
        { id: 1, name: "AA", level: 1 },
        { id: 2, name: "A", level: 2 }
    ]
    const homeworkRow = (userId: string, divisionId: number) => ({
        userId,
        firstName: userId.toUpperCase(),
        lastName: `Last-${userId}`,
        preferredName: null,
        divisionId
    })

    it("lists undrafted players by consideration count, score, then name", () => {
        const result = buildConsideredButUndrafted(
            [
                homeworkRow("p1", 1),
                homeworkRow("p2", 1),
                homeworkRow("p2", 2),
                homeworkRow("p3", 2),
                homeworkRow("p4", 1),
                homeworkRow("p5", 99)
            ],
            {
                draftedThisSeason: new Set(["p4"]),
                higherDivisionRows,
                signupRows: [
                    signup("p1", { pairPick: "p3" }),
                    signup("p3", { firstName: "Pia", preferredName: "Pip" })
                ],
                scoreByUser: new Map([
                    ["p1", 150],
                    ["p3", 120]
                ])
            }
        )
        expect(result).toEqual([
            {
                userId: "p2",
                displayName: "P2",
                lastName: "Last-p2",
                pairDisplayName: null,
                score: 200,
                consideredInDivisions: ["AA", "A"],
                considerationCount: 2
            },
            {
                userId: "p3",
                displayName: "P3",
                lastName: "Last-p3",
                pairDisplayName: null,
                score: 120,
                consideredInDivisions: ["A"],
                considerationCount: 1
            },
            {
                userId: "p1",
                displayName: "P1",
                lastName: "Last-p1",
                pairDisplayName: "Pip Last-p3",
                score: 150,
                consideredInDivisions: ["AA"],
                considerationCount: 1
            },
            {
                userId: "p5",
                displayName: "P5",
                lastName: "Last-p5",
                pairDisplayName: null,
                score: 200,
                consideredInDivisions: ["Unknown"],
                considerationCount: 1
            }
        ])
    })
})
