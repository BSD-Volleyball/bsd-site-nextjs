import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { individual_divisions, teams } from "@/database/schema"
import { createDivision, createSeason, createTeam } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { lockDraftRounds, setCaptainRound } from "../rounds/actions"
import { saveDraftOrder } from "./actions"

async function seedDivisionWithTeams() {
    const season = await createSeason()
    const division = await createDivision({ name: "A", level: 2 })
    await db.insert(individual_divisions).values({
        season: season.id,
        division: division.id,
        gender_split: "5-3",
        teams: 2
    })
    const capA = await createUser()
    const capB = await createUser()
    const teamA = await createTeam({
        season: season.id,
        division: division.id,
        captain: capA.id
    })
    const teamB = await createTeam({
        season: season.id,
        division: division.id,
        captain: capB.id
    })
    return { season, division, capA, capB, teamA, teamB }
}

async function lockStepOne(divisionId: number, captainIds: string[]) {
    for (const captainId of captainIds) {
        const r = await setCaptainRound({ captainId, round: 1, divisionId })
        expect(r.status).toBe(true)
    }
    const lock = await lockDraftRounds({ divisionId })
    expect(lock.status).toBe(true)
}

describe("saveDraftOrder", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await saveDraftOrder(1, [])
        expect(result).toEqual({ status: false, message: "Unauthorized" })
    })

    it("rejects authenticated non-commissioners", async () => {
        const { division } = await seedDivisionWithTeams()
        await createUserWithRoles([{ role: "captain" }])
        const result = await saveDraftOrder(division.id, [])
        expect(result).toEqual({ status: false, message: "Unauthorized" })
    })

    it("is blocked until Step 1 is locked", async () => {
        const { division, teamA, teamB } = await seedDivisionWithTeams()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveDraftOrder(division.id, [
            { teamId: teamA.id, number: 1 },
            { teamId: teamB.id, number: 2 }
        ])
        expect(result.status).toBe(false)
        expect(result.message).toContain("Step 1")
    })

    it("requires every team in the division with unique numbers", async () => {
        const { division, capA, capB, teamA } = await seedDivisionWithTeams()
        await createUserWithRoles([{ role: "admin" }])
        await lockStepOne(division.id, [capA.id, capB.id])

        const partial = await saveDraftOrder(division.id, [
            { teamId: teamA.id, number: 1 }
        ])
        expect(partial).toEqual({
            status: false,
            message: "Every team in the division must be ordered."
        })
    })

    it("rejects a team from another division", async () => {
        const { season, division, capA, capB, teamA } =
            await seedDivisionWithTeams()
        const other = await createDivision({ name: "BB", level: 6 })
        const outsider = await createTeam({
            season: season.id,
            division: other.id,
            captain: (await createUser()).id
        })
        await createUserWithRoles([{ role: "admin" }])
        await lockStepOne(division.id, [capA.id, capB.id])

        const result = await saveDraftOrder(division.id, [
            { teamId: teamA.id, number: 1 },
            { teamId: outsider.id, number: 2 }
        ])
        expect(result).toEqual({
            status: false,
            message: "One or more teams are not in this division."
        })
    })

    it("writes team numbers and stamps the order lock", async () => {
        const { division, capA, capB, teamA, teamB } =
            await seedDivisionWithTeams()
        const admin = await createUserWithRoles([{ role: "admin" }])
        await lockStepOne(division.id, [capA.id, capB.id])

        const result = await saveDraftOrder(division.id, [
            { teamId: teamB.id, number: 1 },
            { teamId: teamA.id, number: 2 }
        ])
        expect(result.status).toBe(true)

        const rows = await db
            .select({ id: teams.id, number: teams.number })
            .from(teams)
            .where(eq(teams.division, division.id))
        expect(Object.fromEntries(rows.map((r) => [r.id, r.number]))).toEqual({
            [teamB.id]: 1,
            [teamA.id]: 2
        })

        const [indiv] = await db
            .select({
                lockedAt: individual_divisions.draft_order_locked_at,
                lockedBy: individual_divisions.draft_order_locked_by
            })
            .from(individual_divisions)
            .where(eq(individual_divisions.division, division.id))
        expect(indiv.lockedAt).toBeInstanceOf(Date)
        expect(indiv.lockedBy).toBe(admin.id)
    })
})
