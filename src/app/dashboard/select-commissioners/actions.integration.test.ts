import { and, eq, isNotNull, isNull } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { auditLog, userRoles } from "@/database/schema"
import { createDivision, createSeason } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { getCommissionersForSeason, saveCommissioners } from "./actions"

async function divisionCommissionerRows(seasonId: number) {
    return db
        .select()
        .from(userRoles)
        .where(
            and(
                eq(userRoles.role, "commissioner"),
                eq(userRoles.season_id, seasonId),
                isNotNull(userRoles.division_id)
            )
        )
}

describe("saveCommissioners", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await saveCommissioners({
            seasonId: 1,
            assignments: []
        })
        expect(result).toEqual({ status: false, message: "Unauthorized" })
    })

    it("rejects authenticated non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await saveCommissioners({
            seasonId: 1,
            assignments: []
        })
        expect(result).toEqual({ status: false, message: "Unauthorized" })
    })

    it("rejects an invalid season id", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await saveCommissioners({
            seasonId: 0,
            assignments: []
        })
        expect(result).toEqual({
            status: false,
            message: "Invalid season ID."
        })
    })

    it("replaces division-scoped rows, preserves league-wide rows, and audits", async () => {
        const season = await createSeason()
        const divisionAA = await createDivision({ name: "AA", level: 1 })
        const divisionA = await createDivision({ name: "A", level: 2 })
        const c1 = await createUser()
        const c2 = await createUser()
        const c3 = await createUser()
        const stale = await createUser()
        const leagueWide = await createUser()
        const admin = await createUserWithRoles([{ role: "admin" }])

        // Pre-existing rows: one stale division-scoped, one league-wide.
        await db.insert(userRoles).values([
            {
                user_id: stale.id,
                role: "commissioner",
                season_id: season.id,
                division_id: divisionAA.id
            },
            {
                user_id: leagueWide.id,
                role: "commissioner",
                season_id: season.id,
                division_id: null
            }
        ])

        const result = await saveCommissioners({
            seasonId: season.id,
            assignments: [
                {
                    divisionId: divisionAA.id,
                    divisionName: "AA",
                    commissioner1: c1.id,
                    commissioner2: c2.id
                },
                {
                    divisionId: divisionA.id,
                    divisionName: "A",
                    commissioner1: c3.id,
                    commissioner2: null
                }
            ]
        })

        expect(result.status).toBe(true)
        expect(result.message).toBe("Commissioners updated successfully.")

        const rows = await divisionCommissionerRows(season.id)
        expect(rows).toHaveLength(3)
        expect(
            rows
                .filter((r) => r.division_id === divisionAA.id)
                .map((r) => r.user_id)
                .sort()
        ).toEqual([c1.id, c2.id].sort())
        expect(
            rows
                .filter((r) => r.division_id === divisionA.id)
                .map((r) => r.user_id)
        ).toEqual([c3.id])
        expect(rows.some((r) => r.user_id === stale.id)).toBe(false)

        // League-wide commissioner row is deliberately untouched.
        const leagueRows = await db
            .select()
            .from(userRoles)
            .where(
                and(
                    eq(userRoles.user_id, leagueWide.id),
                    eq(userRoles.role, "commissioner"),
                    isNull(userRoles.division_id)
                )
            )
        expect(leagueRows).toHaveLength(1)

        const audit = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, admin.id))
        expect(audit).toHaveLength(1)
        expect(audit[0].action).toBe("update")
        expect(audit[0].entity_type).toBe("commissioners")
    })

    it("clears all division-scoped rows when every slot is empty", async () => {
        const season = await createSeason()
        const divisionAA = await createDivision({ name: "AA", level: 1 })
        const existing = await createUser()
        await createUserWithRoles([{ role: "admin" }])
        await db.insert(userRoles).values({
            user_id: existing.id,
            role: "commissioner",
            season_id: season.id,
            division_id: divisionAA.id
        })

        const result = await saveCommissioners({
            seasonId: season.id,
            assignments: [
                {
                    divisionId: divisionAA.id,
                    divisionName: "AA",
                    commissioner1: null,
                    commissioner2: null
                }
            ]
        })

        expect(result.status).toBe(true)
        expect(await divisionCommissionerRows(season.id)).toHaveLength(0)
    })
})

describe("getCommissionersForSeason", () => {
    it("rejects non-admin callers", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await getCommissionersForSeason(1)
        expect(result).toEqual({
            status: false,
            message: "Unauthorized",
            assignments: []
        })
    })

    it("rejects an invalid season id", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await getCommissionersForSeason(-5)
        expect(result).toEqual({
            status: false,
            message: "Invalid season.",
            assignments: []
        })
    })

    it("round-trips assignments saved via saveCommissioners", async () => {
        const season = await createSeason()
        const divisionAA = await createDivision({ name: "AA", level: 1 })
        const divisionBB = await createDivision({ name: "BB", level: 6 })
        const c1 = await createUser()
        const c2 = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        await saveCommissioners({
            seasonId: season.id,
            assignments: [
                {
                    divisionId: divisionAA.id,
                    divisionName: "AA",
                    commissioner1: c1.id,
                    commissioner2: c2.id
                },
                {
                    divisionId: divisionBB.id,
                    divisionName: "BB",
                    commissioner1: null,
                    commissioner2: null
                }
            ]
        })

        const result = await getCommissionersForSeason(season.id)

        expect(result.status).toBe(true)
        // getDivisions only surfaces the known division names, AA first.
        expect(result.assignments.map((a) => a.divisionName)).toEqual([
            "AA",
            "BB"
        ])
        const aa = result.assignments.find((a) => a.divisionName === "AA")
        expect([aa?.commissioner1, aa?.commissioner2].sort()).toEqual(
            [c1.id, c2.id].sort()
        )
        const bb = result.assignments.find((a) => a.divisionName === "BB")
        expect(bb?.commissioner1).toBeNull()
        expect(bb?.commissioner2).toBeNull()
    })
})
