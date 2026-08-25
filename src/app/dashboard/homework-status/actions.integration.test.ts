import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { individual_divisions, movingDay } from "@/database/schema"
import { createDivision, createSeason, createTeam } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { getHomeworkStatusData } from "./actions"

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
