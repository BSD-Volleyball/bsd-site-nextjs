import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    auditLog,
    individual_divisions,
    movingDay,
    week2Rosters
} from "@/database/schema"
import { createDivision, createSeason, createTeam } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { submitCoachWeek2Homework, submitWeek2Homework } from "./actions"

const emptyInput = {
    forcedMoveUpMale: "",
    forcedMoveUpNonMale: "",
    forcedMoveDownMale: "",
    forcedMoveDownNonMale: "",
    recommendedMoveUp: [] as string[],
    recommendedMoveDown: [] as string[]
}

/**
 * A captain in the only active division. With one division the captain's team
 * is both the top and the bottom of the ladder, so no forced move up/down is
 * required and the test can focus on what gets recorded.
 */
async function seedSoloDivisionCaptain() {
    const season = await createSeason()
    const division = await createDivision()
    const teammate = await createUser()
    const captain = await createUserWithRoles([{ role: "captain" }])
    await db.insert(week2Rosters).values([
        {
            season: season.id,
            user: captain.id,
            division: division.id,
            team_number: 1,
            is_captain: true
        },
        {
            season: season.id,
            user: teammate.id,
            division: division.id,
            team_number: 1,
            is_captain: false
        }
    ])
    return { season, division, captain, teammate }
}

describe("submitWeek2Homework", () => {
    it("rejects a submitter who was not a week 2 captain", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "captain" }])

        const result = await submitWeek2Homework(emptyInput)

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain(
            "not a captain in Week 2"
        )
    })

    // The submit replaces this captain's picks wholesale, so the audit entry
    // records the resulting set — a bare "homework submitted" could not put
    // a mistaken overwrite back.
    it("records the submitted picks in the audit entry", async () => {
        const { captain, teammate } = await seedSoloDivisionCaptain()

        const result = await submitWeek2Homework({
            ...emptyInput,
            recommendedMoveUp: [teammate.id]
        })
        expect(result.status).toBe(true)

        const rows = await db
            .select()
            .from(movingDay)
            .where(eq(movingDay.submitted_by, captain.id))
        expect(rows).toHaveLength(1)

        const [entry] = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, captain.id))
        expect(entry.action).toBe("submit_week2_homework")
        expect(entry.entity_type).toBe("moving_day")
        expect(entry.summary).toContain("captain week 2 homework")
        expect(JSON.parse(entry.summary.split("Full picks: ")[1])).toEqual([
            { player: teammate.id, direction: "up", is_forced: false }
        ])
    })

    it("records an empty submission too", async () => {
        const { captain } = await seedSoloDivisionCaptain()

        const result = await submitWeek2Homework(emptyInput)
        expect(result.status).toBe(true)

        const [entry] = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, captain.id))
        expect(entry.summary).toContain("0 moving-day pick(s)")
    })
})

/**
 * Two-division season: AA (level 1, top) and A (level 2, bottom). The
 * captain under test leads team 1 in A, so they must submit a forced
 * move UP and the rival sits on team 2 in A.
 */
async function seedTwoTeamDivision() {
    const season = await createSeason()
    const divAA = await createDivision({ name: "AA", level: 1 })
    const divA = await createDivision({ name: "A", level: 2 })
    const captain = await createUserWithRoles([{ role: "captain" }], {
        male: true
    })
    const ownMale = await createUser({ male: true })
    const ownNonMale = await createUser({ male: false })
    const rival = await createUser({ male: true })
    await db.insert(week2Rosters).values([
        {
            season: season.id,
            user: captain.id,
            division: divA.id,
            team_number: 1,
            is_captain: true
        },
        {
            season: season.id,
            user: ownMale.id,
            division: divA.id,
            team_number: 1,
            is_captain: false
        },
        {
            season: season.id,
            user: ownNonMale.id,
            division: divA.id,
            team_number: 1,
            is_captain: false
        },
        {
            season: season.id,
            user: rival.id,
            division: divA.id,
            team_number: 2,
            is_captain: false
        }
    ])
    return { season, divAA, divA, captain, ownMale, ownNonMale, rival }
}

describe("submitWeek2Homework — forced picks are scoped to the captain's team", () => {
    it("rejects a forced move for a player on another team", async () => {
        const { captain, ownNonMale, rival } = await seedTwoTeamDivision()

        const result = await submitWeek2Homework({
            ...emptyInput,
            forcedMoveUpMale: rival.id,
            forcedMoveUpNonMale: ownNonMale.id
        })

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain(
            "your Week 2 team"
        )
        expect(
            await db
                .select()
                .from(movingDay)
                .where(eq(movingDay.submitted_by, captain.id))
        ).toHaveLength(0)
    })

    it("rejects a forced move in the wrong gender slot", async () => {
        const { ownMale, ownNonMale } = await seedTwoTeamDivision()

        const result = await submitWeek2Homework({
            ...emptyInput,
            forcedMoveUpMale: ownNonMale.id,
            forcedMoveUpNonMale: ownMale.id
        })

        expect(result.status).toBe(false)
    })

    it("rejects a recommendation for someone not in the week 2 tryout", async () => {
        const { ownMale, ownNonMale } = await seedTwoTeamDivision()
        const outsider = await createUser()

        const result = await submitWeek2Homework({
            ...emptyInput,
            forcedMoveUpMale: ownMale.id,
            forcedMoveUpNonMale: ownNonMale.id,
            recommendedMoveDown: [outsider.id]
        })

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain(
            "Week 2 tryout"
        )
    })

    it("accepts forced picks from the captain's own team", async () => {
        const { captain, ownMale, ownNonMale, rival } =
            await seedTwoTeamDivision()

        const result = await submitWeek2Homework({
            ...emptyInput,
            forcedMoveUpMale: ownMale.id,
            forcedMoveUpNonMale: ownNonMale.id,
            // Recommendations may name anyone in the division-wide tryout.
            recommendedMoveDown: [rival.id]
        })

        expect(result.status).toBe(true)
        const rows = await db
            .select({ player: movingDay.player, forced: movingDay.is_forced })
            .from(movingDay)
            .where(eq(movingDay.submitted_by, captain.id))
        expect(rows).toHaveLength(3)
        expect(
            rows
                .filter((r) => r.forced)
                .map((r) => r.player)
                .sort()
        ).toEqual([ownMale.id, ownNonMale.id].sort())
    })
})

describe("submitCoachWeek2Homework — forced picks must be on the named team", () => {
    async function seedCoachDivision() {
        const season = await createSeason()
        await createDivision({ name: "AA", level: 1 })
        const divA = await createDivision({ name: "A", level: 2 })
        await db.insert(individual_divisions).values({
            season: season.id,
            division: divA.id,
            coaches: true,
            gender_split: "4-2",
            teams: 2
        })
        const coach = await createUserWithRoles([{ role: "captain" }])
        await createTeam({
            season: season.id,
            captain: coach.id,
            division: divA.id
        })
        const team1Player = await createUser()
        const team2Player = await createUser()
        await db.insert(week2Rosters).values([
            {
                season: season.id,
                user: team1Player.id,
                division: divA.id,
                team_number: 1,
                is_captain: false
            },
            {
                season: season.id,
                user: team2Player.id,
                division: divA.id,
                team_number: 2,
                is_captain: false
            }
        ])
        return { coach, team1Player, team2Player }
    }

    it("rejects a forced move whose player is not on that team", async () => {
        const { coach, team1Player, team2Player } = await seedCoachDivision()

        const result = await submitCoachWeek2Homework({
            forcedMoveUpByTeam: [
                { teamNumber: 1, playerId: team2Player.id },
                { teamNumber: 2, playerId: team1Player.id }
            ],
            recommendedMoveUp: [],
            recommendedMoveDown: []
        })

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain("Team")
        expect(
            await db
                .select()
                .from(movingDay)
                .where(eq(movingDay.submitted_by, coach.id))
        ).toHaveLength(0)
    })

    it("accepts forced moves that match the roster", async () => {
        const { team1Player, team2Player } = await seedCoachDivision()

        const result = await submitCoachWeek2Homework({
            forcedMoveUpByTeam: [
                { teamNumber: 1, playerId: team1Player.id },
                { teamNumber: 2, playerId: team2Player.id }
            ],
            recommendedMoveUp: [],
            recommendedMoveDown: []
        })

        expect(result.status).toBe(true)
    })
})
