import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { matches } from "@/database/schema"
import {
    createDivision,
    createMatch,
    createSeason,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { type MatchScoreInput, saveScoresForDivision } from "./actions"

const MATCH_DATE = "2026-09-12"

type Fixture = {
    seasonId: number
    staleSeasonId: number
    divisionId: number
    matchId: number
    homeTeamId: number
    awayTeamId: number
}

let fixture: Fixture

beforeEach(async () => {
    // Created first so it has a lower id — the fixture season stays "current"
    const staleSeason = await createSeason({ year: 2020, season: "spring" })
    const season = await createSeason()
    const division = await createDivision()
    const captainA = await createUser()
    const captainB = await createUser()
    const home = await createTeam({
        season: season.id,
        division: division.id,
        captain: captainA.id,
        name: "Home"
    })
    const away = await createTeam({
        season: season.id,
        division: division.id,
        captain: captainB.id,
        name: "Away"
    })
    const match = await createMatch({
        season: season.id,
        division: division.id,
        date: MATCH_DATE,
        home_team: home.id,
        away_team: away.id
    })
    fixture = {
        seasonId: season.id,
        staleSeasonId: staleSeason.id,
        divisionId: division.id,
        matchId: match.id,
        homeTeamId: home.id,
        awayTeamId: away.id
    }
})

function scoreInput(overrides: Partial<MatchScoreInput> = {}): MatchScoreInput {
    return {
        matchId: fixture.matchId,
        homeScore: 2,
        awayScore: 1,
        homeSet1Score: 25,
        awaySet1Score: 20,
        homeSet2Score: 20,
        awaySet2Score: 25,
        homeSet3Score: 15,
        awaySet3Score: 10,
        winner: fixture.homeTeamId,
        ...overrides
    }
}

describe("saveScoresForDivision", () => {
    it("rejects users without the scores:enter permission", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await saveScoresForDivision(
            fixture.divisionId,
            MATCH_DATE,
            [scoreInput()]
        )
        expect(result).toEqual({ status: false, message: "Unauthorized" })
    })

    it("rejects referees whose role is bound to a different season", async () => {
        await createUserWithRoles([
            { role: "referee", seasonId: fixture.staleSeasonId }
        ])
        const result = await saveScoresForDivision(
            fixture.divisionId,
            MATCH_DATE,
            [scoreInput()]
        )
        expect(result).toEqual({ status: false, message: "Unauthorized" })
    })

    it("persists set scores and the winner for a season-scoped referee", async () => {
        await createUserWithRoles([
            { role: "referee", seasonId: fixture.seasonId }
        ])

        const result = await saveScoresForDivision(
            fixture.divisionId,
            MATCH_DATE,
            [scoreInput()]
        )

        expect(result.status).toBe(true)
        const [saved] = await db
            .select()
            .from(matches)
            .where(eq(matches.id, fixture.matchId))
        expect(saved.home_set1_score).toBe(25)
        expect(saved.away_set2_score).toBe(25)
        expect(saved.home_score).toBe(2)
        expect(saved.winner).toBe(fixture.homeTeamId)
    })

    it("rejects negative scores", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await saveScoresForDivision(
            fixture.divisionId,
            MATCH_DATE,
            [scoreInput({ homeSet1Score: -1 })]
        )
        expect(result).toEqual({
            status: false,
            message: "Scores cannot be negative."
        })
    })

    it("rejects match ids that belong to another division", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const otherDivision = await createDivision({ name: "Other", level: 2 })

        const result = await saveScoresForDivision(
            otherDivision.id,
            MATCH_DATE,
            [scoreInput()]
        )

        expect(result.status).toBe(false)
        expect(result.message).toContain("Invalid match IDs")
    })

    it("rejects a winner that is not a participant of the match", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const outsiderCaptain = await createUser()
        const outsider = await createTeam({
            season: fixture.seasonId,
            division: fixture.divisionId,
            captain: outsiderCaptain.id,
            name: "Outsider"
        })

        const result = await saveScoresForDivision(
            fixture.divisionId,
            MATCH_DATE,
            [scoreInput({ winner: outsider.id })]
        )

        expect(result.status).toBe(false)
        expect(result.message).toContain("Invalid winner")
    })
})
