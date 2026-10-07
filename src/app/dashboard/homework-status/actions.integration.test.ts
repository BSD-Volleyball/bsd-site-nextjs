import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { individual_divisions, movingDay } from "@/database/schema"
import { createDivision, createSeason, createTeam } from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"
import {
    getDraftHomeworkDetail,
    getMovingDayDetail,
    getRatePlayersDetail
} from "./actions"
import { getHomeworkStatusData } from "./data"

// Seeds a season with a top division (AA, level 1) and a lower division
// (A, level 2), one captained team in each. Top/bottom status must be derived
// from the whole season's division ladder, not just the selected division.
async function seedTwoDivisionSeason() {
    const season = await createSeason({ phase: "prep_tryout_week_3" })
    const divAA = await createDivision({ name: "AA", level: 1 })
    const divA = await createDivision({ name: "A", level: 2 })

    await db.insert(individual_divisions).values([
        {
            season: season.id,
            division: divAA.id,
            coaches: false,
            gender_split: "4-2",
            teams: 1
        },
        {
            season: season.id,
            division: divA.id,
            coaches: false,
            gender_split: "4-2",
            teams: 1
        }
    ])

    const captainAA = await createUser()
    const captainA = await createUser()
    await createTeam({
        season: season.id,
        captain: captainAA.id,
        division: divAA.id
    })
    await createTeam({
        season: season.id,
        captain: captainA.id,
        division: divA.id
    })

    return { season, divAA, divA, captainAA, captainA }
}

describe("getHomeworkStatusData moving-day completion", () => {
    it("marks a top-division captain complete with 2 forced-down picks when only their division is selected", async () => {
        const { season, divAA, captainAA } = await seedTwoDivisionSeason()

        // AA is the top division: its captains submit exactly 2 forced-down
        // picks (one male, one non-male) and no forced-up picks.
        const playerA = await createUser()
        const playerB = await createUser()
        await db.insert(movingDay).values([
            {
                season: season.id,
                submitted_by: captainAA.id,
                player: playerA.id,
                direction: "down",
                is_forced: true
            },
            {
                season: season.id,
                submitted_by: captainAA.id,
                player: playerB.id,
                direction: "down",
                is_forced: true
            }
        ])

        await createUserWithRoles([{ role: "admin" }])
        const result = await getHomeworkStatusData(divAA.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        const aaStatus = result.data.divisions.find(
            (d) => d.divisionId === divAA.id
        )
        expect(aaStatus).toBeDefined()
        const captainStatus = aaStatus?.captains.find(
            (c) => c.captainId === captainAA.id
        )
        expect(captainStatus?.movingDayComplete).toBe(true)
    })

    it("marks a bottom-division captain complete with 2 forced-up picks when only their division is selected", async () => {
        const { season, divA, captainA } = await seedTwoDivisionSeason()

        // A is the bottom division here: its captains submit exactly 2
        // forced-up picks and no forced-down picks.
        const playerA = await createUser()
        const playerB = await createUser()
        await db.insert(movingDay).values([
            {
                season: season.id,
                submitted_by: captainA.id,
                player: playerA.id,
                direction: "up",
                is_forced: true
            },
            {
                season: season.id,
                submitted_by: captainA.id,
                player: playerB.id,
                direction: "up",
                is_forced: true
            }
        ])

        await createUserWithRoles([{ role: "admin" }])
        const result = await getHomeworkStatusData(divA.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        const aStatus = result.data.divisions.find(
            (d) => d.divisionId === divA.id
        )
        expect(aStatus).toBeDefined()
        const captainStatus = aStatus?.captains.find(
            (c) => c.captainId === captainA.id
        )
        expect(captainStatus?.movingDayComplete).toBe(true)
    })
})

describe("homework-status detail actions — commissioner division scope", () => {
    async function seedCaptainsInTwoDivisions() {
        const { season, divAA, divA, captainAA, captainA } =
            await seedTwoDivisionSeason()
        const player = await createUser()
        await db.insert(movingDay).values({
            season: season.id,
            submitted_by: captainAA.id,
            player: player.id,
            direction: "down",
            is_forced: true
        })
        return { season, divAA, divA, captainAA, captainA }
    }

    it("lets a division-scoped commissioner read their own division's captain", async () => {
        const { season, divAA, captainAA } = await seedCaptainsInTwoDivisions()
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id, divisionId: divAA.id }
        ])

        const result = await getMovingDayDetail(captainAA.id, season.id)

        expect(result.status).toBe(true)
        expect(result.status && result.data.forcedDown).toHaveLength(1)
    })

    it("refuses a division-scoped commissioner reading another division's captain", async () => {
        const { season, divA, captainAA } = await seedCaptainsInTwoDivisions()
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id, divisionId: divA.id }
        ])

        const moving = await getMovingDayDetail(captainAA.id, season.id)
        const rate = await getRatePlayersDetail(captainAA.id, season.id)
        const draft = await getDraftHomeworkDetail(captainAA.id, season.id)

        for (const result of [moving, rate, draft]) {
            expect(result.status).toBe(false)
            expect(result.status === false && result.message).toBe(
                "Unauthorized"
            )
        }
    })

    it("refuses a commissioner of a different season", async () => {
        const { season, divAA, captainAA } = await seedCaptainsInTwoDivisions()
        const otherSeason = await createSeason()
        await createUserWithRoles([
            {
                role: "commissioner",
                seasonId: otherSeason.id,
                divisionId: divAA.id
            }
        ])

        const result = await getMovingDayDetail(captainAA.id, season.id)

        expect(result.status).toBe(false)
    })

    it("lets an admin read any captain", async () => {
        const { season, captainA } = await seedCaptainsInTwoDivisions()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getMovingDayDetail(captainA.id, season.id)

        expect(result.status).toBe(true)
    })

    it("refuses when signed out", async () => {
        const { season, captainA } = await seedCaptainsInTwoDivisions()
        logout()

        const result = await getMovingDayDetail(captainA.id, season.id)

        expect(result.status).toBe(false)
    })

    // One user can captain in two divisions in a season (a coaches division
    // and a regular one). A commissioner scoped to either may read them.
    it("lets a scoped commissioner read a captain who also captains elsewhere", async () => {
        const { season, divAA, divA } = await seedCaptainsInTwoDivisions()
        const twoTeamCaptain = await createUser()
        await createTeam({
            season: season.id,
            captain: twoTeamCaptain.id,
            division: divAA.id
        })
        await createTeam({
            season: season.id,
            captain: twoTeamCaptain.id,
            division: divA.id
        })
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id, divisionId: divA.id }
        ])

        const result = await getMovingDayDetail(twoTeamCaptain.id, season.id)

        expect(result.status).toBe(true)
    })
})
