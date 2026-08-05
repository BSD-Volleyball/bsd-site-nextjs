import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { auditLog, individual_divisions } from "@/database/schema"
import { createDivision, createSeason, createSignup } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { getDivisionsPageData, saveDivisionSelections } from "./actions"

describe("getDivisionsPageData", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getDivisionsPageData()
        expect(result.status).toBe(false)
        expect(result.message).toBe("Unauthorized")
        expect(result.activeDivisions).toEqual([])
    })

    it("rejects authenticated non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await getDivisionsPageData()
        expect(result.status).toBe(false)
        expect(result.message).toBe("Unauthorized")
    })

    it("returns active divisions and signup gender totals for an admin", async () => {
        const season = await createSeason()
        const divA = await createDivision({ name: "A", level: 2 })
        await createDivision({ name: "Retired", level: 9, active: false })

        const male = await createUser({ male: true })
        const nonMale = await createUser({ male: false })
        await createSignup({ season: season.id, player: male.id })
        await createSignup({ season: season.id, player: nonMale.id })

        await createUserWithRoles([{ role: "admin" }])
        const result = await getDivisionsPageData()

        expect(result.status).toBe(true)
        expect(result.seasonId).toBe(season.id)
        expect(result.activeDivisions.map((d) => d.id)).toContain(divA.id)
        expect(result.activeDivisions.some((d) => d.name === "Retired")).toBe(
            false
        )
        expect(result.totalMales).toBe(1)
        expect(result.totalNonMales).toBe(1)
    })
})

describe("saveDivisionSelections", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await saveDivisionSelections({
            seasonId: 1,
            selections: []
        })
        expect(result).toEqual({ status: false, message: "Unauthorized" })
    })

    it("rejects an enabled selection with an invalid team count", async () => {
        const season = await createSeason()
        const division = await createDivision()
        await createUserWithRoles([{ role: "admin" }])

        const result = await saveDivisionSelections({
            seasonId: season.id,
            selections: [
                {
                    divisionId: division.id,
                    enabled: true,
                    teams: 5,
                    genderSplit: "5-3",
                    coaches: false
                }
            ]
        })
        expect(result).toEqual({
            status: false,
            message: "Teams must be 4 or 6."
        })
    })

    it("saves enabled selections and replaces them on re-save", async () => {
        const season = await createSeason()
        const divA = await createDivision({ name: "A", level: 2 })
        const divBB = await createDivision({ name: "BB", level: 6 })
        await createUserWithRoles([{ role: "admin" }])

        const first = await saveDivisionSelections({
            seasonId: season.id,
            selections: [
                {
                    divisionId: divA.id,
                    enabled: true,
                    teams: 4,
                    genderSplit: "5-3",
                    coaches: true
                },
                {
                    divisionId: divBB.id,
                    enabled: false,
                    teams: 6,
                    genderSplit: "4-4",
                    coaches: false
                }
            ]
        })
        expect(first.status).toBe(true)

        const rowsAfterFirst = await db
            .select()
            .from(individual_divisions)
            .where(eq(individual_divisions.season, season.id))
        expect(rowsAfterFirst).toHaveLength(1)
        expect(rowsAfterFirst[0]).toMatchObject({
            division: divA.id,
            teams: 4,
            gender_split: "5-3",
            coaches: true
        })

        // Re-save with a different enabled set: old rows are replaced
        const second = await saveDivisionSelections({
            seasonId: season.id,
            selections: [
                {
                    divisionId: divBB.id,
                    enabled: true,
                    teams: 6,
                    genderSplit: "4-4",
                    coaches: false
                }
            ]
        })
        expect(second.status).toBe(true)

        const rowsAfterSecond = await db
            .select()
            .from(individual_divisions)
            .where(eq(individual_divisions.season, season.id))
        expect(rowsAfterSecond).toHaveLength(1)
        expect(rowsAfterSecond[0]).toMatchObject({
            division: divBB.id,
            teams: 6,
            gender_split: "4-4"
        })
    })

    // The save replaces every row for the season, so a count-only audit
    // summary would leave a bad save with nothing to restore from.
    it("records the full selection payload in the audit entry", async () => {
        const season = await createSeason()
        const divA = await createDivision({ name: "A", level: 2 })
        const admin = await createUserWithRoles([{ role: "admin" }])

        await saveDivisionSelections({
            seasonId: season.id,
            selections: [
                {
                    divisionId: divA.id,
                    enabled: true,
                    teams: 4,
                    genderSplit: "5-3",
                    coaches: true
                }
            ]
        })

        const [entry] = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, admin.id))
        expect(entry.summary).toContain("1 division(s) enabled")
        // Replayable: the exact rows that were written.
        expect(JSON.parse(entry.summary.split("Full selections: ")[1])).toEqual(
            [
                {
                    divisionId: divA.id,
                    enabled: true,
                    teams: 4,
                    genderSplit: "5-3",
                    coaches: true
                }
            ]
        )
    })
})
