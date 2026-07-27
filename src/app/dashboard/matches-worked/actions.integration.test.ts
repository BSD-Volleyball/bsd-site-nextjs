import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { matchReferees, seasonRefs } from "@/database/schema"
import {
    createDivision,
    createMatch,
    createSeason,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { getMatchesWorkedData } from "./actions"

async function seedSchedule() {
    const season = await createSeason({
        certified_ref_rate: "30.00",
        uncertified_ref_rate: "20.00"
    })
    const division = await createDivision()
    const captainA = await createUser()
    const captainB = await createUser()
    const home = await createTeam({
        season: season.id,
        captain: captainA.id,
        division: division.id,
        name: "Home"
    })
    const away = await createTeam({
        season: season.id,
        captain: captainB.id,
        division: division.id,
        name: "Away"
    })
    const base = {
        season: season.id,
        division: division.id,
        home_team: home.id,
        away_team: away.id
    }
    const pastMatch = await createMatch({
        ...base,
        date: "2026-06-01",
        time: "18:00"
    })
    const futureMatch = await createMatch({
        ...base,
        date: "2099-01-01",
        time: "18:00"
    })
    return { season, pastMatch, futureMatch }
}

describe("getMatchesWorkedData", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getMatchesWorkedData()
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("fails when no season exists", async () => {
        await createUserWithRoles([])
        const result = await getMatchesWorkedData()
        expect(result).toEqual({
            status: false,
            message: "No current season found."
        })
    })

    it("returns past assignments at the certified rate for a certified ref", async () => {
        const { season, pastMatch, futureMatch } = await seedSchedule()
        const ref = await createUserWithRoles([
            { role: "referee", seasonId: season.id }
        ])
        await db.insert(seasonRefs).values({
            season_id: season.id,
            user_id: ref.id,
            is_certified: true,
            max_division_level: 6
        })
        await db.insert(matchReferees).values([
            {
                match_id: pastMatch.id,
                referee_id: ref.id,
                season_id: season.id
            },
            {
                match_id: futureMatch.id,
                referee_id: ref.id,
                season_id: season.id
            }
        ])

        const result = await getMatchesWorkedData()

        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected ok")
        const data = result.data
        expect(data.isCertified).toBe(true)
        expect(data.ratePerMatch).toBe("30.00")
        // Only the past match counts as worked; the future one is excluded.
        expect(data.matches).toHaveLength(1)
        expect(data.matches[0].matchId).toBe(pastMatch.id)
        expect(data.matches[0].homeTeamName).toBe("Home")
        expect(data.matches[0].awayTeamName).toBe("Away")
        expect(data.matches[0].pay).toBe("30.00")
        expect(data.totalPay).toBe("30.00")
        expect(data.seasonLabel).toBe("2026 fall")
    })

    it("uses the uncertified rate and no matches for a user without a ref record", async () => {
        const { season, pastMatch } = await seedSchedule()
        const otherRef = await createUser()
        await db.insert(matchReferees).values({
            match_id: pastMatch.id,
            referee_id: otherRef.id,
            season_id: season.id
        })
        await createUserWithRoles([])

        const result = await getMatchesWorkedData()

        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected ok")
        expect(result.data.isCertified).toBe(false)
        expect(result.data.ratePerMatch).toBe("20.00")
        // Another ref's assignments never leak into this user's list.
        expect(result.data.matches).toEqual([])
        expect(result.data.totalPay).toBe("0.00")
    })
})
