import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { drafts, userUnavailability } from "@/database/schema"
import {
    createDivision,
    createMatch,
    createSeason,
    createSeasonEvent,
    createSignup,
    createTeam
} from "@/test/factories"
import { createUser } from "@/test/session"
import {
    getLastMatchResultForUser,
    getNextMatchForUser,
    getScheduleSummaries
} from "./next-match"

// Characterizes the schedule lookups the friends list and dashboard cards
// run for every friend, so the batched implementation provably keeps the
// single-player semantics.

async function seedTwoTeams(options: { draftOpponent?: boolean } = {}) {
    const season = await createSeason()
    const division = await createDivision({ name: "AA" })
    const me = await createUser()
    const them = await createUser()
    const myTeam = await createTeam({
        season: season.id,
        captain: me.id,
        division: division.id,
        name: "Mine",
        number: 1
    })
    const theirTeam = await createTeam({
        season: season.id,
        captain: them.id,
        division: division.id,
        name: "Theirs",
        number: 2
    })
    await db
        .insert(drafts)
        .values({ team: myTeam.id, user: me.id, round: 1, overall: 1 })
    if (options.draftOpponent !== false) {
        await db
            .insert(drafts)
            .values({ team: theirTeam.id, user: them.id, round: 1, overall: 2 })
    }
    return { season, division, me, them, myTeam, theirTeam }
}

describe("getNextMatchForUser", () => {
    it("returns null for a player with no team this season", async () => {
        const season = await createSeason()
        const loner = await createUser()
        expect(await getNextMatchForUser(loner.id, season.id)).toBeNull()
    })

    it("picks the earliest unplayed match and names the opponent", async () => {
        const { season, division, me, myTeam, theirTeam } = await seedTwoTeams()
        await createMatch({
            season: season.id,
            division: division.id,
            week: 1,
            date: "2026-10-01",
            home_team: myTeam.id,
            away_team: theirTeam.id,
            home_set1_score: 25,
            away_set1_score: 20
        })
        await createMatch({
            season: season.id,
            division: division.id,
            week: 3,
            date: "2026-10-15",
            time: "19:30:00",
            court: 4,
            home_team: theirTeam.id,
            away_team: myTeam.id
        })
        await createMatch({
            season: season.id,
            division: division.id,
            week: 2,
            date: "2026-10-08",
            time: "20:00:00",
            court: 2,
            home_team: myTeam.id,
            away_team: theirTeam.id
        })

        const next = await getNextMatchForUser(me.id, season.id)
        expect(next).toMatchObject({
            date: "2026-10-08",
            court: 2,
            opponentName: "Theirs",
            divisionName: "AA",
            week: 2,
            isUnavailable: false,
            sortKey: "2026-10-08T20:00:00"
        })
    })

    it("uses the week's season event when the match has no date, and flags unavailability", async () => {
        const { season, division, me, myTeam, theirTeam } = await seedTwoTeams()
        await createSeasonEvent(season.id, {
            event_type: "regular_season",
            event_date: "2026-10-02"
        })
        const week2 = await createSeasonEvent(season.id, {
            event_type: "regular_season",
            event_date: "2026-10-09"
        })
        const signup = await createSignup({ season: season.id, player: me.id })
        await db.insert(userUnavailability).values({
            user_id: me.id,
            signup_id: signup.id,
            event_id: week2.id
        })
        await createMatch({
            season: season.id,
            division: division.id,
            week: 2,
            home_team: myTeam.id,
            away_team: theirTeam.id
        })

        const next = await getNextMatchForUser(me.id, season.id)
        expect(next).toMatchObject({
            date: "2026-10-09",
            isUnavailable: true
        })
    })

    it("calls the opponent 'Team N' until its division has drafted", async () => {
        const season = await createSeason()
        const mine = await createDivision({ name: "AA" })
        const other = await createDivision({ name: "BB", level: 2 })
        const me = await createUser()
        const captain = await createUser()
        const myTeam = await createTeam({
            season: season.id,
            captain: me.id,
            division: mine.id,
            name: "Mine"
        })
        // A crossover opponent from a division with no drafts yet
        const opponent = await createTeam({
            season: season.id,
            captain: captain.id,
            division: other.id,
            name: "Secret Name",
            number: 7
        })
        await db
            .insert(drafts)
            .values({ team: myTeam.id, user: me.id, round: 1, overall: 1 })
        await createMatch({
            season: season.id,
            division: mine.id,
            week: 1,
            date: "2026-10-01",
            home_team: myTeam.id,
            away_team: opponent.id
        })

        const next = await getNextMatchForUser(me.id, season.id)
        expect(next?.opponentName).toBe("Team 7")
    })
})

describe("getLastMatchResultForUser", () => {
    it("prefers a playoff match over a later-numbered regular week", async () => {
        const { season, division, me, myTeam, theirTeam } = await seedTwoTeams()
        await createMatch({
            season: season.id,
            division: division.id,
            week: 9,
            date: "2026-11-20",
            home_team: myTeam.id,
            away_team: theirTeam.id,
            home_score: 2,
            away_score: 0
        })
        await createMatch({
            season: season.id,
            division: division.id,
            week: 1,
            date: "2026-12-01",
            playoff: true,
            home_team: theirTeam.id,
            away_team: myTeam.id,
            home_score: 2,
            away_score: 1
        })

        const last = await getLastMatchResultForUser(me.id, season.id)
        expect(last).toMatchObject({
            won: false,
            myGames: 1,
            oppGames: 2,
            opponentName: "Theirs",
            week: 1,
            date: "2026-12-01"
        })
    })
})

describe("schedule lookups across seasons and players", () => {
    it("does not reveal team names from a past season's draft", async () => {
        const past = await createSeason({ year: 2024 })
        const season = await createSeason({ year: 2026 })
        const mine = await createDivision({ name: "AA" })
        const other = await createDivision({ name: "BB", level: 2 })
        const me = await createUser()
        const captain = await createUser()
        // The other division drafted last season, not this one.
        const oldTeam = await createTeam({
            season: past.id,
            captain: captain.id,
            division: other.id
        })
        await db.insert(drafts).values({
            team: oldTeam.id,
            user: captain.id,
            round: 1,
            overall: 1
        })
        const myTeam = await createTeam({
            season: season.id,
            captain: me.id,
            division: mine.id
        })
        const opponent = await createTeam({
            season: season.id,
            captain: captain.id,
            division: other.id,
            name: "Secret Name",
            number: 3
        })
        await db
            .insert(drafts)
            .values({ team: myTeam.id, user: me.id, round: 1, overall: 1 })
        await createMatch({
            season: season.id,
            division: mine.id,
            date: "2026-10-01",
            home_team: myTeam.id,
            away_team: opponent.id
        })

        const next = await getNextMatchForUser(me.id, season.id)
        expect(next?.opponentName).toBe("Team 3")
    })

    it("answers for several players at once, each from their own side", async () => {
        const { season, division, me, them, myTeam, theirTeam } =
            await seedTwoTeams()
        const loner = await createUser()
        await createMatch({
            season: season.id,
            division: division.id,
            week: 1,
            date: "2026-10-01",
            home_team: myTeam.id,
            away_team: theirTeam.id,
            home_score: 2,
            away_score: 0
        })
        await createMatch({
            season: season.id,
            division: division.id,
            week: 2,
            date: "2026-10-08",
            home_team: theirTeam.id,
            away_team: myTeam.id
        })

        const summaries = await getScheduleSummaries(
            [me.id, them.id, loner.id],
            season.id
        )
        expect(summaries.get(me.id)?.nextMatch?.opponentName).toBe("Theirs")
        expect(summaries.get(them.id)?.nextMatch?.opponentName).toBe("Mine")
        expect(summaries.get(me.id)?.lastResult?.won).toBe(true)
        expect(summaries.get(them.id)?.lastResult?.won).toBe(false)
        expect(summaries.get(loner.id)).toEqual({
            nextMatch: null,
            lastResult: null
        })
    })
})
