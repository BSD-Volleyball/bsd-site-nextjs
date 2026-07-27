import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { auditLog, teams, userRoles } from "@/database/schema"
import { createDivision, createSeason, createSignup } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { createTeams } from "./actions"

// Division named "BB" needs exactly 4 teams — the smallest valid fixture.
async function seedBBDivision() {
    const season = await createSeason()
    const division = await createDivision({ name: "BB", level: 6 })
    const captains = []
    for (let i = 0; i < 4; i++) {
        const captain = await createUser()
        await createSignup({ season: season.id, player: captain.id })
        captains.push(captain)
    }
    return { season, division, captains }
}

function teamsPayload(
    captains: { id: string }[]
): Array<{ captainId: string; coach2Id?: string; teamName: string }> {
    return captains.map((c, i) => ({
        captainId: c.id,
        teamName: `Team ${i + 1}`
    }))
}

async function captainRoleRows(userId: string) {
    return db
        .select()
        .from(userRoles)
        .where(
            and(eq(userRoles.user_id, userId), eq(userRoles.role, "captain"))
        )
}

describe("createTeams", () => {
    it("rejects unauthenticated callers", async () => {
        const { division, captains } = await seedBBDivision()
        const result = await createTeams(division.id, teamsPayload(captains))
        expect(result).toEqual({
            status: false,
            message: "You don't have permission to perform this action."
        })
        expect(await db.select().from(teams)).toHaveLength(0)
    })

    it("rejects authenticated users who are not commissioners", async () => {
        const { division, captains } = await seedBBDivision()
        await createUserWithRoles([{ role: "captain" }])
        const result = await createTeams(division.id, teamsPayload(captains))
        expect(result).toEqual({
            status: false,
            message: "You don't have permission to perform this action."
        })
    })

    it("rejects a commissioner scoped to a different division", async () => {
        const { season, division, captains } = await seedBBDivision()
        const otherDivision = await createDivision({ name: "A", level: 2 })
        await createUserWithRoles([
            {
                role: "commissioner",
                seasonId: season.id,
                divisionId: otherDivision.id
            }
        ])

        const result = await createTeams(division.id, teamsPayload(captains))

        expect(result).toEqual({
            status: false,
            message: "You don't have permission for this division."
        })
        expect(await db.select().from(teams)).toHaveLength(0)
    })

    it("requires the exact team count for the division", async () => {
        const { division, captains } = await seedBBDivision()
        await createUserWithRoles([{ role: "admin" }])
        const result = await createTeams(
            division.id,
            teamsPayload(captains.slice(0, 3))
        )
        expect(result).toEqual({
            status: false,
            message: "Division BB requires 4 teams."
        })
    })

    it("requires primary captains to be signed up for the season", async () => {
        const { division, captains } = await seedBBDivision()
        const notSignedUp = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const payload = teamsPayload(captains)
        payload[0] = { captainId: notSignedUp.id, teamName: "Team 1" }
        const result = await createTeams(division.id, payload)

        expect(result).toEqual({
            status: false,
            message:
                "All selected primary captains must be signed up for the current season."
        })
    })

    it("creates teams and grants season+division captain roles for an admin", async () => {
        const { season, division, captains } = await seedBBDivision()
        const admin = await createUserWithRoles([{ role: "admin" }])

        const result = await createTeams(division.id, teamsPayload(captains))

        expect(result.status).toBe(true)
        expect(result.message).toBe("Successfully created teams!")

        const teamRows = await db
            .select()
            .from(teams)
            .where(
                and(
                    eq(teams.season, season.id),
                    eq(teams.division, division.id)
                )
            )
            .orderBy(teams.number)
        expect(teamRows).toHaveLength(4)
        expect(teamRows.map((t) => t.number)).toEqual([1, 2, 3, 4])
        expect(teamRows.map((t) => t.captain)).toEqual(
            captains.map((c) => c.id)
        )
        expect(teamRows.map((t) => t.name)).toEqual([
            "Team 1",
            "Team 2",
            "Team 3",
            "Team 4"
        ])

        for (const captain of captains) {
            const roles = await captainRoleRows(captain.id)
            expect(roles).toHaveLength(1)
            expect(roles[0].season_id).toBe(season.id)
            expect(roles[0].division_id).toBe(division.id)
            expect(roles[0].granted_by).toBe(admin.id)
        }

        const audit = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, admin.id))
        expect(audit).toHaveLength(1)
        expect(audit[0].action).toBe("create")
        expect(audit[0].entity_type).toBe("teams")
    })

    it("upserts on re-save: keeps team rows, swaps captains, and syncs roles", async () => {
        const { season, division, captains } = await seedBBDivision()
        await createUserWithRoles([{ role: "admin" }])
        await createTeams(division.id, teamsPayload(captains))
        const before = await db
            .select()
            .from(teams)
            .where(eq(teams.division, division.id))
            .orderBy(teams.number)

        const replacement = await createUser()
        await createSignup({ season: season.id, player: replacement.id })
        const payload = teamsPayload([replacement, ...captains.slice(1)])
        const result = await createTeams(division.id, payload)

        expect(result.status).toBe(true)
        expect(result.message).toBe("Successfully updated teams!")

        const after = await db
            .select()
            .from(teams)
            .where(eq(teams.division, division.id))
            .orderBy(teams.number)
        expect(after).toHaveLength(4)
        // Same row updated in place, not deleted and recreated.
        expect(after[0].id).toBe(before[0].id)
        expect(after[0].captain).toBe(replacement.id)

        // Role sync: removed captain revoked, replacement granted.
        expect(await captainRoleRows(captains[0].id)).toHaveLength(0)
        expect(await captainRoleRows(replacement.id)).toHaveLength(1)
        expect(await captainRoleRows(captains[1].id)).toHaveLength(1)
    })

    it("rejects unknown captain ids before writing anything", async () => {
        const { division, captains } = await seedBBDivision()
        await createUserWithRoles([{ role: "admin" }])

        // A coach2Id that doesn't exist is caught by upfront validation —
        // nothing is written and the user gets a targeted message.
        const payload = teamsPayload(captains)
        payload[3] = { ...payload[3], coach2Id: crypto.randomUUID() }
        const result = await createTeams(division.id, payload)

        expect(result).toEqual({
            status: false,
            message: "One or more selected captains could not be found."
        })
        expect(await db.select().from(teams)).toHaveLength(0)
        // No captain roles were granted for the failed save.
        for (const captain of captains) {
            expect(await captainRoleRows(captain.id)).toHaveLength(0)
        }
    })
})
