import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { auditLog, seasonRefs, userRoles } from "@/database/schema"
import { createDivision, createSeason } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { addSeasonRef, removeSeasonRef, updateSeasonRef } from "./actions"

async function refereeRoleRows(userId: string, seasonId: number) {
    return db
        .select()
        .from(userRoles)
        .where(
            and(
                eq(userRoles.user_id, userId),
                eq(userRoles.role, "referee"),
                eq(userRoles.season_id, seasonId)
            )
        )
}

describe("addSeasonRef", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await addSeasonRef("some-user")
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("rejects authenticated users without schedule:manage", async () => {
        const target = await createUser()
        await createUserWithRoles([{ role: "captain" }])
        const result = await addSeasonRef(target.id)
        expect(result).toEqual({ status: false, message: "Unauthorized." })
        expect(await db.select().from(seasonRefs)).toHaveLength(0)
    })

    it("lets a referee coordinator add a ref with defaults and grants the role", async () => {
        const season = await createSeason()
        await createDivision({ level: 6 })
        await createDivision({ level: 2 })
        const target = await createUser()
        const coordinator = await createUserWithRoles([
            { role: "referee_coordinator", seasonId: season.id }
        ])

        const result = await addSeasonRef(target.id)

        expect(result.status).toBe(true)
        const [row] = await db
            .select()
            .from(seasonRefs)
            .where(eq(seasonRefs.user_id, target.id))
        expect(row.season_id).toBe(season.id)
        expect(row.is_certified).toBe(false)
        expect(row.has_w9).toBe(false)
        expect(row.passed_test).toBe(false)
        expect(row.is_active).toBe(true)
        // Defaults to the highest active division level.
        expect(row.max_division_level).toBe(6)

        const roles = await refereeRoleRows(target.id, season.id)
        expect(roles).toHaveLength(1)
        expect(roles[0].granted_by).toBe(coordinator.id)

        const audit = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, coordinator.id))
        expect(audit).toHaveLength(1)
        expect(audit[0].action).toBe("create")
        expect(audit[0].entity_type).toBe("season_refs")
    })

    it("carries forward certification data from a previous season", async () => {
        const prevSeason = await createSeason()
        const currentSeason = await createSeason()
        await createDivision({ level: 6 })
        const target = await createUser()
        await db.insert(seasonRefs).values({
            season_id: prevSeason.id,
            user_id: target.id,
            is_certified: true,
            has_w9: true,
            passed_test: true,
            max_division_level: 3
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await addSeasonRef(target.id)

        expect(result.status).toBe(true)
        const [row] = await db
            .select()
            .from(seasonRefs)
            .where(
                and(
                    eq(seasonRefs.user_id, target.id),
                    eq(seasonRefs.season_id, currentSeason.id)
                )
            )
        expect(row.is_certified).toBe(true)
        expect(row.has_w9).toBe(true)
        expect(row.passed_test).toBe(true)
        expect(row.max_division_level).toBe(3)
    })

    it("rejects adding the same user twice in one season", async () => {
        await createSeason()
        await createDivision({ level: 6 })
        const target = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        await addSeasonRef(target.id)
        const result = await addSeasonRef(target.id)

        expect(result).toEqual({
            status: false,
            message: "User is already a ref for this season."
        })
        expect(await db.select().from(seasonRefs)).toHaveLength(1)
    })
})

describe("removeSeasonRef", () => {
    it("rejects authenticated users without schedule:manage", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await removeSeasonRef(1)
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects an invalid id", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await removeSeasonRef(0)
        expect(result).toEqual({
            status: false,
            message: "Invalid Season ref ID."
        })
    })

    it("fails when the ref record does not exist", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await removeSeasonRef(9999)
        expect(result).toEqual({
            status: false,
            message: "Ref record not found."
        })
    })

    it("deletes the ref record and revokes the season referee role", async () => {
        const season = await createSeason()
        await createDivision({ level: 6 })
        const target = await createUser()
        await createUserWithRoles([{ role: "admin" }])
        await addSeasonRef(target.id)
        const [row] = await db
            .select()
            .from(seasonRefs)
            .where(eq(seasonRefs.user_id, target.id))
        expect(await refereeRoleRows(target.id, season.id)).toHaveLength(1)

        const result = await removeSeasonRef(row.id)

        expect(result.status).toBe(true)
        expect(await db.select().from(seasonRefs)).toHaveLength(0)
        expect(await refereeRoleRows(target.id, season.id)).toHaveLength(0)
    })
})

describe("updateSeasonRef", () => {
    it("rejects authenticated users without schedule:manage", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await updateSeasonRef(1, true, true, true, true, 3)
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("updates certification, W9, test, active, and max level fields", async () => {
        await createSeason()
        await createDivision({ level: 6 })
        const target = await createUser()
        await createUserWithRoles([{ role: "admin" }])
        await addSeasonRef(target.id)
        const [before] = await db
            .select()
            .from(seasonRefs)
            .where(eq(seasonRefs.user_id, target.id))

        const result = await updateSeasonRef(
            before.id,
            true,
            true,
            true,
            false,
            2
        )

        expect(result.status).toBe(true)
        const [after] = await db
            .select()
            .from(seasonRefs)
            .where(eq(seasonRefs.id, before.id))
        expect(after.is_certified).toBe(true)
        expect(after.has_w9).toBe(true)
        expect(after.passed_test).toBe(true)
        expect(after.is_active).toBe(false)
        expect(after.max_division_level).toBe(2)
    })

    it("rejects a negative max division level with a targeted message", async () => {
        await createSeason()
        await createDivision({ level: 6 })
        const target = await createUser()
        await createUserWithRoles([{ role: "admin" }])
        await addSeasonRef(target.id)
        const [row] = await db
            .select()
            .from(seasonRefs)
            .where(eq(seasonRefs.user_id, target.id))

        const result = await updateSeasonRef(row.id, true, true, true, true, -1)

        expect(result).toEqual({
            status: false,
            message: "Max division level must be a non-negative integer"
        })
        const [after] = await db
            .select()
            .from(seasonRefs)
            .where(eq(seasonRefs.id, row.id))
        expect(after.is_certified).toBe(false)
    })
})
