import { describe, expect, it } from "vitest"
import {
    buildTournamentScheduleView,
    type ScheduleSourceMatch
} from "@/lib/tournament-schedule"

function poolMatch(
    overrides: Partial<ScheduleSourceMatch> & { id: number }
): ScheduleSourceMatch {
    return {
        division_id: 1,
        pool_id: 10,
        bracket: "pool",
        bracket_round: null,
        court: null,
        start_time: null,
        home_team_id: null,
        away_team_id: null,
        work_team_id: null,
        home_set1_score: null,
        home_set2_score: null,
        home_set3_score: null,
        away_set1_score: null,
        away_set2_score: null,
        away_set3_score: null,
        winner_team_id: null,
        ...overrides
    }
}

const teams = [
    { id: 1, name: "Alpha" },
    { id: 2, name: "Bravo" }
]
const pools = [{ id: 10, name: "Pool A" }]
const divisions = [{ id: 1, divisionName: "A", sortOrder: 0 }]

describe("buildTournamentScheduleView", () => {
    it("groups pool matches per division and resolves team names", () => {
        const matches = [
            poolMatch({
                id: 1,
                home_team_id: 1,
                away_team_id: 2,
                home_set1_score: 25,
                away_set1_score: 20,
                home_set2_score: 25,
                away_set2_score: 18,
                winner_team_id: 1
            })
        ]
        const view = buildTournamentScheduleView({
            tournamentName: "Summer Slam",
            eliminationFormat: "single",
            myTeamId: null,
            divisions,
            matches,
            teams,
            pools
        })

        expect(view.hasPoolMatches).toBe(true)
        expect(view.hasBracketMatches).toBe(false)
        expect(view.divisions).toHaveLength(1)
        const pool = view.divisions[0].pools[0]
        expect(pool.name).toBe("Pool A")
        expect(pool.matches[0].home?.name).toBe("Alpha")
        expect(pool.matches[0].away?.name).toBe("Bravo")
        expect(pool.matches[0].winnerTeamId).toBe(1)
        expect(pool.matches[0].played).toBe(true)
    })

    it("orders bracket groups winners -> losers -> final, then by round", () => {
        const matches = [
            poolMatch({
                id: 2,
                pool_id: null,
                bracket: "final",
                bracket_round: 1
            }),
            poolMatch({
                id: 3,
                pool_id: null,
                bracket: "winners",
                bracket_round: 2
            }),
            poolMatch({
                id: 4,
                pool_id: null,
                bracket: "winners",
                bracket_round: 1
            })
        ]
        const view = buildTournamentScheduleView({
            tournamentName: "Summer Slam",
            eliminationFormat: "single",
            myTeamId: 7,
            divisions,
            matches,
            teams,
            pools
        })

        expect(view.myTeamId).toBe(7)
        expect(view.hasBracketMatches).toBe(true)
        expect(
            view.divisions[0].bracketGroups.map(
                (g) => `${g.bracket}:${g.round}`
            )
        ).toEqual(["winners:1", "winners:2", "final:1"])
    })

    it("drops divisions with no matches", () => {
        const view = buildTournamentScheduleView({
            tournamentName: "Empty",
            eliminationFormat: "double",
            myTeamId: null,
            divisions: [
                { id: 1, divisionName: "A", sortOrder: 0 },
                { id: 2, divisionName: "B", sortOrder: 1 }
            ],
            matches: [],
            teams,
            pools
        })
        expect(view.divisions).toHaveLength(0)
        expect(view.hasPoolMatches).toBe(false)
    })
})
