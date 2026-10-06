import { describe, expect, it } from "vitest"
import type { RatePlayerEntry } from "./data"
import {
    type RatePlayerUserRow,
    buildByTeamDivisions,
    buildDivisionGroups,
    buildPlayerEntries,
    buildRatedPlayers,
    buildRatedSeasons,
    buildTryout1Sessions,
    latestDivisionByPlayer
} from "./rate-player-groups"

function user(
    id: string,
    lastName: string,
    male: boolean | null = true
): RatePlayerUserRow {
    return {
        id,
        oldId: null,
        firstName: id.toUpperCase(),
        lastName,
        preferredName: null,
        male,
        height: null,
        picture: null
    }
}

function entry(
    id: string,
    lastName: string,
    male: boolean | null = true,
    lastDivisionName: string | null = null
): RatePlayerEntry {
    return { ...user(id, lastName, male), lastDivisionName }
}

const ids = (players: RatePlayerEntry[]) => players.map((p) => p.id)

describe("latestDivisionByPlayer", () => {
    it("keeps the first (newest) division per player", () => {
        const map = latestDivisionByPlayer([
            { userId: "a", divisionName: "AA" },
            { userId: "b", divisionName: "BB" },
            { userId: "a", divisionName: "A" }
        ])
        expect([...map.entries()]).toEqual([
            ["a", "AA"],
            ["b", "BB"]
        ])
    })
})

describe("buildPlayerEntries", () => {
    it("drops the viewer, attaches last divisions, and orders new players first, then male, then last name", () => {
        const lastDiv = new Map([
            ["r1", "AA"],
            ["r2", "BB"]
        ])
        const players = buildPlayerEntries(
            [
                user("r1", "Adams"),
                user("me", "Aaron"),
                user("n1", "Young", false),
                user("n2", "Zed"),
                user("r2", "Baker", false),
                user("n3", "Brown")
            ],
            "me",
            lastDiv
        )
        expect(ids(players)).toEqual(["n3", "n2", "n1", "r1", "r2"])
        expect(players.find((p) => p.id === "r2")?.lastDivisionName).toBe("BB")
        expect(players.find((p) => p.id === "n1")?.lastDivisionName).toBe(null)
    })
})

describe("buildRatedPlayers / buildRatedSeasons", () => {
    const rated = (
        id: string,
        lastName: string,
        seasonId: number,
        seasonYear: number,
        ratedAt: string | null
    ) => ({
        ...user(id, lastName),
        seasonId,
        seasonName: "fall",
        seasonYear,
        overall: 3,
        ratedAt: ratedAt ? new Date(ratedAt) : null
    })

    it("labels seasons, sorts newest first and allows rating only current signups other than the viewer", () => {
        const ratedPlayers = buildRatedPlayers(
            [
                rated("a", "Adams", 1, 2024, "2024-10-01T00:00:00Z"),
                rated("b", "Baker", 2, 2025, null),
                rated("me", "Myself", 2, 2025, "2025-10-01T00:00:00Z"),
                rated("c", "Cole", 2, 2025, "2025-10-02T00:00:00Z")
            ],
            new Map([["a", "A"]]),
            new Set(["a", "me", "c"]),
            "me"
        )
        expect(
            ratedPlayers.map((r) => [
                r.player.id,
                r.seasonLabel,
                r.ratedAt,
                r.canRate,
                r.player.lastDivisionName
            ])
        ).toEqual([
            ["c", "Fall 2025", "2025-10-02T00:00:00.000Z", true, null],
            ["me", "Fall 2025", "2025-10-01T00:00:00.000Z", false, null],
            ["a", "Fall 2024", "2024-10-01T00:00:00.000Z", true, "A"],
            ["b", "Fall 2025", null, false, null]
        ])
        expect(buildRatedSeasons(ratedPlayers)).toEqual([
            { seasonId: 2, label: "Fall 2025" },
            { seasonId: 1, label: "Fall 2024" }
        ])
    })
})

describe("buildTryout1Sessions", () => {
    it("groups by session with all four courts and drops invalid rows", () => {
        const a = entry("a", "Adams")
        const b = entry("b", "Baker", false)
        const c = entry("c", "Cole")
        const playersById = new Map([a, b, c].map((p) => [p.id, p]))
        const sessions = buildTryout1Sessions(
            [
                { userId: "a", sessionNumber: 2, courtNumber: 1 },
                { userId: "b", sessionNumber: 2, courtNumber: 1 },
                { userId: "c", sessionNumber: 2, courtNumber: 1 },
                { userId: "a", sessionNumber: 1, courtNumber: 4 },
                { userId: "b", sessionNumber: 1, courtNumber: 5 },
                { userId: "b", sessionNumber: 0, courtNumber: 2 },
                { userId: "zz", sessionNumber: 3, courtNumber: 1 }
            ],
            playersById,
            new Map([["a", "A"]])
        )
        expect(
            sessions.map((s) => [
                s.sessionNumber,
                s.courts.map((c) => [c.courtNumber, ids(c.players)])
            ])
        ).toEqual([
            [
                1,
                [
                    [1, []],
                    [2, []],
                    [3, []],
                    [4, ["a"]]
                ]
            ],
            [
                2,
                [
                    [1, ["c", "b", "a"]],
                    [2, []],
                    [3, []],
                    [4, []]
                ]
            ]
        ])
    })
})

describe("buildDivisionGroups", () => {
    it("orders divisions by level and teams by number", () => {
        const a = entry("a", "Adams")
        const b = entry("b", "Baker")
        const c = entry("c", "Cole")
        const playersById = new Map([a, b, c].map((p) => [p.id, p]))
        const groups = buildDivisionGroups(
            [
                {
                    userId: "c",
                    divisionName: "BB",
                    divisionLevel: 3,
                    teamNumber: 6
                },
                {
                    userId: "b",
                    divisionName: "AA",
                    divisionLevel: 1,
                    teamNumber: 2
                },
                {
                    userId: "a",
                    divisionName: "AA",
                    divisionLevel: 1,
                    teamNumber: 2
                },
                {
                    userId: "c",
                    divisionName: "AA",
                    divisionLevel: 1,
                    teamNumber: 1
                },
                {
                    userId: "zz",
                    divisionName: "A",
                    divisionLevel: 2,
                    teamNumber: 1
                }
            ],
            playersById,
            new Map()
        )
        expect(
            groups.map((g) => [
                g.divisionName,
                g.teams.map((t) => [t.teamNumber, ids(t.players)])
            ])
        ).toEqual([
            [
                "AA",
                [
                    [1, ["c"]],
                    [2, ["a", "b"]]
                ]
            ],
            ["BB", [[6, ["c"]]]]
        ])
    })
})

describe("buildByTeamDivisions", () => {
    const team = (
        teamId: number,
        divisionName: string,
        captain: string,
        captain2: string | null = null
    ) => ({
        teamId,
        teamName: `Team ${teamId}`,
        teamNumber: teamId,
        captain,
        captain2,
        divisionName
    })

    it("builds rosters from captains and active players, keeping row order", () => {
        const players = [
            entry("c1", "Cap"),
            entry("c2", "Co", false),
            entry("p1", "Pick"),
            entry("s1", "Sub")
        ]
        const playersById = new Map(players.map((p) => [p.id, p]))
        const result = buildByTeamDivisions(
            [
                team(1, "AA", "c1", "c2"),
                team(2, "A", "outsider"),
                team(3, "AA", "me")
            ],
            [
                { teamId: 1, activeUser: { id: "p1" } },
                { teamId: 1, activeUser: { id: "c1" } },
                { teamId: 2, activeUser: { id: "s1" } },
                { teamId: 3, activeUser: { id: "nobody" } }
            ],
            "me",
            playersById,
            new Map()
        )
        expect(
            result.byTeamDivisions.map((d) => [
                d.divisionName,
                d.teams.map((t) => [t.teamId, t.teamName, ids(t.players)])
            ])
        ).toEqual([
            [
                "AA",
                [
                    [1, "Team 1", ["c1", "p1", "c2"]],
                    [3, "Team 3", []]
                ]
            ],
            ["A", [[2, "Team 2", ["s1"]]]]
        ])
        expect(result.captainTeam).toEqual({ divisionName: "AA", teamId: 3 })
    })

    it("has no captain team when the viewer captains none", () => {
        const result = buildByTeamDivisions(
            [team(1, "AA", "c1", "me2")],
            [],
            "me",
            new Map(),
            new Map()
        )
        expect(result.captainTeam).toBeNull()
        expect(result.byTeamDivisions).toEqual([
            {
                divisionName: "AA",
                teams: [
                    {
                        teamId: 1,
                        teamName: "Team 1",
                        teamNumber: 1,
                        players: []
                    }
                ]
            }
        ])
    })
})
