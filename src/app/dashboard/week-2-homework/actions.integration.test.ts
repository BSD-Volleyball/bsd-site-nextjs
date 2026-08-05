import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { auditLog, movingDay, week2Rosters } from "@/database/schema"
import { createDivision, createSeason } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { submitWeek2Homework } from "./actions"

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
