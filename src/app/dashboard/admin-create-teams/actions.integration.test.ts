import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { teams, userRoles } from "@/database/schema"
import { createDivision, createSeason } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { createTeams, getCreateTeamsData } from "./actions"

describe("getCreateTeamsData", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getCreateTeamsData()
        expect(result.status).toBe(false)
        expect(result.message).toBe(
            "You don't have permission to access this page."
        )
        expect(result.seasons).toEqual([])
    })

    it("rejects authenticated non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await getCreateTeamsData()
        expect(result.status).toBe(false)
    })

    it("returns seasons, divisions and users for an admin", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const admin = await createUserWithRoles([{ role: "admin" }])

        const result = await getCreateTeamsData()
        expect(result.status).toBe(true)
        expect(result.seasons.map((s) => s.id)).toContain(season.id)
        expect(result.divisions.map((d) => d.id)).toContain(division.id)
        expect(result.users.map((u) => u.id)).toContain(admin.id)
    })
})

describe("createTeams", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await createTeams(1, 1, [
            { captainId: "someone", teamName: "Alpha" }
        ])
        expect(result).toEqual({
            status: false,
            message: "You don't have permission to perform this action."
        })
    })

    it("rejects a non-positive season ID", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await createTeams(0, 1, [
            { captainId: "someone", teamName: "Alpha" }
        ])
        expect(result).toEqual({
            status: false,
            message: "Invalid season ID."
        })
    })

    it("rejects a team without a name", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const captain = await createUser()
        const result = await createTeams(1, 1, [
            { captainId: captain.id, teamName: "   " }
        ])
        expect(result).toEqual({
            status: false,
            message: "Please enter a name for team 1."
        })
    })

    it("creates teams and grants season+division captain roles", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const cap1 = await createUser()
        const cap2 = await createUser()
        const coCap = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createTeams(season.id, division.id, [
            { captainId: cap1.id, teamName: "Alpha" },
            { captainId: cap2.id, captain2Id: coCap.id, teamName: "Beta" }
        ])
        expect(result.status).toBe(true)
        expect(result.message).toBe("Successfully created 2 teams!")

        const teamRows = await db
            .select()
            .from(teams)
            .where(eq(teams.season, season.id))
            .orderBy(teams.number)
        expect(teamRows).toHaveLength(2)
        expect(teamRows[0]).toMatchObject({
            name: "Alpha",
            captain: cap1.id,
            captain2: null,
            division: division.id,
            number: 1
        })
        expect(teamRows[1]).toMatchObject({
            name: "Beta",
            captain: cap2.id,
            captain2: coCap.id,
            number: 2
        })

        // All three captains get a captain role scoped to season + division
        for (const userId of [cap1.id, cap2.id, coCap.id]) {
            const roles = await db
                .select()
                .from(userRoles)
                .where(
                    and(
                        eq(userRoles.user_id, userId),
                        eq(userRoles.role, "captain")
                    )
                )
            expect(roles).toHaveLength(1)
            expect(roles[0]).toMatchObject({
                season_id: season.id,
                division_id: division.id
            })
        }
    })
})
