import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    drafts,
    individual_divisions,
    matchReferees,
    playoffMatchesMeta
} from "@/database/schema"
import {
    createDivision,
    createMatch,
    createSeason,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { getPlayoffData } from "./data"

/**
 * Seeds one season with two playoff divisions that between them exercise
 * every path through the page's bracket computation:
 *
 * Alpha (6 teams, SIX_TEAM_PLAYOFF numbering, individual_divisions row):
 *   #1 S4 v S5   decided by the winner column            ref assigned
 *   #2 S1 v W1   decided by home/away games only          work_source NULL
 *                                                         (template -> L1)
 *   #3 S3 v S6   decided by set scores only               bracket NULL
 *   #4 S2 v W3   away team not backfilled, unplayed
 *   #5..#11      meta-only rows (no match), except #7 which has a match row
 *                with no teams; #10 has bracket "championship", #11 is the
 *                W10/L10 reset
 *   plus one playoff match with no meta row at all
 *
 * Beta (4 teams, no individual_divisions row, single elimination, every
 * bracket NULL, direct team-number sources, one team without a number).
 *
 * The viewer is drafted onto Alpha's seed 4 so the anchor logic runs.
 */
async function seedSeason() {
    const viewer = await createUserWithRoles([])
    const captain = await createUser()
    const ref = await createUser({ name: "Rita Ref" })
    const season = await createSeason({
        year: 2031,
        season: "fall",
        phase: "playoffs"
    })
    const alpha = await createDivision({ name: "Alpha", level: 1 })
    const beta = await createDivision({ name: "Beta", level: 2 })

    await db.insert(individual_divisions).values({
        season: season.id,
        division: alpha.id,
        gender_split: "5-3",
        teams: 6
    })

    const alphaNames = ["Aces", "Blocks", "Cuts", "Digs", "Euros", "Floats"]
    const a: number[] = []
    for (let i = 0; i < 6; i++) {
        const team = await createTeam({
            season: season.id,
            division: alpha.id,
            captain: captain.id,
            name: alphaNames[i],
            number: i + 1
        })
        a.push(team.id)
    }
    // seed -> team: S1 Blocks, S2 Aces, S3..S6 Cuts..Floats
    const seed = (n: number) => (n === 1 ? a[1] : n === 2 ? a[0] : a[n - 1])

    const b: number[] = []
    const betaTeams: Array<[string, number | null]> = [
        ["Gamma", 1],
        ["Hitters", 2],
        ["Ink", 3],
        ["Jousters", null]
    ]
    for (const [name, number] of betaTeams) {
        const team = await createTeam({
            season: season.id,
            division: beta.id,
            captain: captain.id,
            name,
            number
        })
        b.push(team.id)
    }

    await db.insert(drafts).values({
        team: seed(4),
        user: viewer.id,
        round: 1,
        overall: 1
    })

    const meta = async (
        divisionId: number,
        values: {
            week: number
            matchNum: number
            matchId?: number | null
            bracket: string | null
            home: string
            away: string
            work?: string | null
            workTeam?: number | null
            next?: number | null
            nextLoser?: number | null
        }
    ) => {
        await db.insert(playoffMatchesMeta).values({
            season: season.id,
            division: divisionId,
            week: values.week,
            match_num: values.matchNum,
            match_id: values.matchId ?? null,
            bracket: values.bracket,
            home_source: values.home,
            away_source: values.away,
            work_source: values.work ?? null,
            work_team: values.workTeam ?? null,
            next_match_num: values.next ?? null,
            next_loser_match_num: values.nextLoser ?? null
        })
    }

    // --- Alpha ---
    const m1 = await createMatch({
        season: season.id,
        division: alpha.id,
        week: 1,
        date: "2031-11-03",
        time: "19:00:00",
        court: 1,
        playoff: true,
        home_team: seed(4),
        away_team: seed(5),
        winner: seed(4),
        home_score: 2,
        away_score: 0,
        home_set1_score: 25,
        away_set1_score: 20,
        home_set2_score: 25,
        away_set2_score: 18
    })
    await db.insert(matchReferees).values({
        match_id: m1.id,
        referee_id: ref.id,
        season_id: season.id
    })
    await meta(alpha.id, {
        week: 1,
        matchNum: 1,
        matchId: m1.id,
        bracket: "winners",
        home: "S4",
        away: "S5",
        work: "S1",
        next: 2,
        nextLoser: 6
    })

    const m2 = await createMatch({
        season: season.id,
        division: alpha.id,
        week: 1,
        date: "2031-11-03",
        time: "19:50:00",
        court: 1,
        playoff: true,
        home_team: seed(1),
        away_team: seed(4),
        home_score: 1,
        away_score: 2,
        home_set1_score: 25,
        away_set1_score: 20,
        home_set2_score: 20,
        away_set2_score: 25,
        home_set3_score: 10,
        away_set3_score: 15
    })
    await meta(alpha.id, {
        week: 1,
        matchNum: 2,
        matchId: m2.id,
        bracket: "winners",
        home: "S1",
        away: "W1",
        work: null,
        next: 7,
        nextLoser: 5
    })

    const m3 = await createMatch({
        season: season.id,
        division: alpha.id,
        week: 1,
        date: "2031-11-03",
        time: "20:40:00",
        court: 1,
        playoff: true,
        home_team: seed(3),
        away_team: seed(6),
        home_set1_score: 25,
        away_set1_score: 10,
        home_set2_score: 18,
        away_set2_score: 25,
        home_set3_score: 15,
        away_set3_score: 12
    })
    await meta(alpha.id, {
        week: 1,
        matchNum: 3,
        matchId: m3.id,
        bracket: null,
        home: "S3",
        away: "S6",
        work: "S2",
        next: 4,
        nextLoser: 5
    })

    const m4 = await createMatch({
        season: season.id,
        division: alpha.id,
        week: 1,
        date: "2031-11-03",
        time: "21:30:00",
        court: 1,
        playoff: true,
        home_team: seed(2),
        away_team: null
    })
    await meta(alpha.id, {
        week: 1,
        matchNum: 4,
        matchId: m4.id,
        bracket: "winners",
        home: "S2",
        away: "W3",
        work: "L3",
        next: 7,
        nextLoser: 6
    })

    await meta(alpha.id, {
        week: 2,
        matchNum: 5,
        bracket: "losers",
        home: "L2",
        away: "L3",
        work: "W2",
        next: 8
    })
    await meta(alpha.id, {
        week: 2,
        matchNum: 6,
        bracket: null,
        home: "L1",
        away: "L4",
        work: "W4",
        next: 8
    })

    const m7 = await createMatch({
        season: season.id,
        division: alpha.id,
        week: 2,
        date: "2031-11-10",
        time: "19:00:00",
        court: 2,
        playoff: true
    })
    await meta(alpha.id, {
        week: 2,
        matchNum: 7,
        matchId: m7.id,
        bracket: "winners",
        home: "W2",
        away: "W4",
        work: "L5",
        next: 10,
        nextLoser: 9
    })
    await meta(alpha.id, {
        week: 2,
        matchNum: 8,
        bracket: "losers",
        home: "W5",
        away: "W6",
        work: "L6",
        next: 9
    })
    await meta(alpha.id, {
        week: 3,
        matchNum: 9,
        bracket: "losers",
        home: "L7",
        away: "W8",
        work: "W7",
        next: 10
    })
    await meta(alpha.id, {
        week: 3,
        matchNum: 10,
        bracket: "championship",
        home: "W7",
        away: "W9",
        work: "L9",
        next: 11,
        nextLoser: 11
    })
    await meta(alpha.id, {
        week: 3,
        matchNum: 11,
        bracket: "championship",
        home: "W10",
        away: "L10",
        work: "L9"
    })

    // A playoff match with no meta row at all
    await createMatch({
        season: season.id,
        division: alpha.id,
        week: 3,
        date: "2031-11-17",
        time: "21:30:00",
        court: 3,
        playoff: true,
        home_team: seed(5),
        away_team: seed(6)
    })

    // --- Beta: single elimination, direct team-number sources ---
    const b1 = await createMatch({
        season: season.id,
        division: beta.id,
        week: 1,
        date: "2031-11-03",
        time: "19:00:00",
        court: 4,
        playoff: true,
        home_team: b[0],
        away_team: null,
        winner: b[0]
    })
    await meta(beta.id, {
        week: 1,
        matchNum: 1,
        matchId: b1.id,
        bracket: null,
        home: "1",
        away: "4",
        workTeam: b[1],
        next: 3
    })
    const b2 = await createMatch({
        season: season.id,
        division: beta.id,
        week: 1,
        date: "2031-11-03",
        time: "19:00:00",
        court: 5,
        playoff: true,
        home_team: b[1],
        away_team: b[2],
        winner: b[2],
        home_score: 0,
        away_score: 2
    })
    await meta(beta.id, {
        week: 1,
        matchNum: 2,
        matchId: b2.id,
        bracket: null,
        home: "2",
        away: "3",
        work: "XYZ",
        next: 3
    })
    const b3 = await createMatch({
        season: season.id,
        division: beta.id,
        week: 2,
        date: "2031-11-10",
        time: "19:00:00",
        court: 4,
        playoff: true,
        home_team: b[0],
        away_team: b[2],
        winner: b[2],
        home_set1_score: 21,
        away_set1_score: 25,
        home_set2_score: 22,
        away_set2_score: 25
    })
    await meta(beta.id, {
        week: 2,
        matchNum: 3,
        matchId: b3.id,
        bracket: null,
        home: "W1",
        away: "W2",
        work: "L2"
    })

    return { season, alpha, beta, a, b, seed }
}

describe("getPlayoffData", () => {
    it("builds both divisions' brackets, labels and anchors", async () => {
        const { season, alpha, beta, b, seed } = await seedSeason()

        const result = await getPlayoffData(season.id)
        if (!result.status) throw new Error(result.message)
        const data = result.data

        expect(data.seasonLabel).toContain("2031")
        expect(data.userTeamId).toBe(seed(4))
        expect(data.userDivisionId).toBe(alpha.id)
        expect(data.divisions.map((d) => d.name)).toEqual(["Alpha", "Beta"])

        const [alphaDiv, betaDiv] = data.divisions
        expect(alphaDiv.id).toBe(alpha.id)
        expect(betaDiv.id).toBe(beta.id)

        // --- Alpha ---
        expect(alphaDiv.champion).toBeNull()
        expect(alphaDiv.seeds).toEqual([
            { seed: 1, teamLabel: "#2 Blocks", teamId: seed(1) },
            { seed: 2, teamLabel: "#1 Aces", teamId: seed(2) },
            { seed: 3, teamLabel: "#3 Cuts", teamId: seed(3) },
            { seed: 4, teamLabel: "#4 Digs", teamId: seed(4) },
            { seed: 5, teamLabel: "#5 Euros", teamId: seed(5) },
            { seed: 6, teamLabel: "#6 Floats", teamId: seed(6) }
        ])
        expect(
            alphaDiv.sections.map((s) => [
                s.key,
                s.label,
                s.rounds.map((r) => [r.round, r.matches.map((m) => m.matchNum)])
            ])
        ).toEqual([
            [
                "winners",
                "Winners Bracket",
                [
                    [1, [1, 3, null]],
                    [2, [2, 4]],
                    [3, [7]]
                ]
            ],
            [
                "losers",
                "Losers Bracket",
                [
                    [1, [5, 6]],
                    [2, [8]],
                    [3, [9]]
                ]
            ],
            [
                "championship",
                "Championship",
                [
                    [1, [10]],
                    [2, [11]]
                ]
            ]
        ])

        const byNum = new Map(
            alphaDiv.scheduleMatches.map((m) => [m.matchNum, m])
        )
        expect(alphaDiv.scheduleMatches.map((m) => m.matchNum)).toEqual([
            1,
            2,
            3,
            4,
            7,
            5,
            6,
            8,
            null,
            9,
            10,
            11
        ])

        const m1 = byNum.get(1)
        expect(m1).toMatchObject({
            homeLabel: "#4 Digs",
            awayLabel: "#5 Euros",
            homeIsWinner: true,
            winnerLabel: "#4 Digs",
            winnerGames: 2,
            loserLabel: "#5 Euros",
            loserGames: 0,
            scoresDisplay: "25-20  25-18",
            refName: "Rita Ref",
            homeSourceLabel: "S4",
            awaySourceLabel: "S5",
            workAssignmentLabel: "#2 Blocks",
            workTeamId: seed(1)
        })

        // Decided by games; work source falls back to the template (L1)
        expect(byNum.get(2)).toMatchObject({
            homeIsWinner: false,
            winnerTeamId: seed(4),
            loserTeamId: seed(1),
            winnerGames: 2,
            loserGames: 1,
            scoresDisplay: "20-25  25-20  15-10",
            workAssignmentLabel: "#5 Euros",
            workTeamId: seed(5),
            awaySourceRefMatch: 1,
            awaySourceRefIsWin: true,
            refName: null
        })

        // Decided by set scores only
        expect(byNum.get(3)).toMatchObject({
            winnerTeamId: seed(3),
            winnerGames: 2,
            loserGames: 1,
            homeScore: null
        })

        // Away side not backfilled: label and effective id follow W3
        expect(byNum.get(4)).toMatchObject({
            awayLabel: "#3 Cuts",
            awayTeamId: seed(3),
            homeIsWinner: null,
            winnerLabel: null,
            scoresDisplay: "—",
            workAssignmentLabel: "#6 Floats"
        })

        expect(byNum.get(5)).toMatchObject({
            id: null,
            homeLabel: "#2 Blocks",
            awayLabel: "#6 Floats",
            workAssignmentLabel: "#4 Digs"
        })
        expect(byNum.get(7)).toMatchObject({
            homeLabel: "#4 Digs",
            awayLabel: "Winner #4",
            homeTeamId: seed(4),
            awayTeamId: null
        })
        expect(byNum.get(10)).toMatchObject({
            homeLabel: "Winner #7",
            awayLabel: "Winner #9",
            homeSourceLabel: "W7",
            awaySourceLabel: "W9",
            round: 1
        })
        expect(byNum.get(null)).toMatchObject({
            homeLabel: "#5 Euros",
            awayLabel: "#6 Floats",
            homeSourceLabel: null,
            workAssignmentLabel: null,
            round: 1
        })

        // First undecided match the viewer's team is in (via W2 on #7)
        expect(alphaDiv.userAnchorMatchNum).toBe(7)
        expect(alphaDiv.userAnchorWeek).toBe(2)

        const bracket = alphaDiv.bracketMatches
        expect(bracket).not.toBeNull()
        expect(bracket?.upper.map((m) => m.id)).toEqual([
            1, 2, 3, 4, 7, 10, 11, -1, -2
        ])
        expect(bracket?.lower.map((m) => m.id)).toEqual([5, 6, 8, 9])
        const bye1 = bracket?.upper.find((m) => m.id === -1)
        expect(bye1).toMatchObject({
            name: "BYE",
            nextMatchId: 2,
            state: "WALK_OVER",
            homeTeamId: seed(1),
            awayTeamId: null
        })
        expect(bye1?.participants.map((p) => p.name)).toEqual([
            "#2 Blocks",
            "BYE"
        ])
        // #11 points nowhere; #10's forward refs both point at #11
        const final = bracket?.upper.find((m) => m.id === 10)
        expect(final?.nextMatchId).toBe(11)
        expect(final?.nextLooserMatchId).toBe(11)
        const first = bracket?.upper.find((m) => m.id === 1)
        expect(first).toMatchObject({
            state: "SCORE_DONE",
            tournamentRoundText: "R1",
            startTime: "2031-11-03",
            nextMatchId: 2,
            nextLooserMatchId: 6
        })
        expect(first?.participants).toEqual([
            {
                id: String(seed(4)),
                name: "#4 Digs",
                resultText: "2",
                isWinner: true,
                status: "PLAYED"
            },
            {
                id: String(seed(5)),
                name: "#5 Euros",
                resultText: "0",
                isWinner: false,
                status: "PLAYED"
            }
        ])

        // --- Beta ---
        expect(betaDiv.champion).toBe("#3 Ink")
        expect(betaDiv.seeds).toEqual([])
        expect(betaDiv.userAnchorMatchNum).toBeNull()
        expect(betaDiv.userAnchorWeek).toBeNull()
        expect(
            betaDiv.sections.map((s) => [
                s.key,
                s.rounds.map((r) => r.matches.map((m) => m.matchNum))
            ])
        ).toEqual([["winners", [[1, 2], [3]]]])
        const betaByNum = new Map(
            betaDiv.scheduleMatches.map((m) => [m.matchNum, m])
        )
        expect(betaByNum.get(1)).toMatchObject({
            homeLabel: "#1 Gamma",
            awayLabel: "Team #4",
            winnerLabel: "#1 Gamma",
            loserLabel: null,
            homeIsWinner: true,
            workAssignmentLabel: "#2 Hitters",
            workTeamId: b[1]
        })
        expect(betaByNum.get(2)).toMatchObject({
            workAssignmentLabel: "XYZ",
            workSourceRefMatch: null
        })
        expect(betaByNum.get(3)).toMatchObject({
            winnerLabel: "#3 Ink",
            scoresDisplay: "25-21  25-22",
            workAssignmentLabel: "#2 Hitters"
        })
        expect(betaDiv.bracketMatches?.upper.map((m) => m.id)).toEqual([
            1, 2, 3
        ])
        expect(betaDiv.bracketMatches?.lower).toEqual([])
    })

    it("returns no divisions for a season without playoff rows", async () => {
        await createUserWithRoles([])
        const season = await createSeason({ year: 2032 })
        const result = await getPlayoffData(season.id)
        expect(result).toEqual({
            status: true,
            data: {
                seasonLabel: expect.any(String),
                divisions: [],
                userTeamId: null,
                userDivisionId: null
            },
            message: undefined
        })
    })
})
