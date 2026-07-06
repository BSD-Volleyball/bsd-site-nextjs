import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { auditLog, sessions, userRoles } from "@/database/schema"
import { createUser, createUserWithRoles } from "@/test/session"
import { addUserRole, getSeasonOptions, removeUserRole } from "./actions"

describe("addUserRole", () => {
    it("rejects unauthenticated callers", async () => {
        const target = await createUser()

        const result = await addUserRole({ userId: target.id, role: "captain" })

        expect(result).toEqual({ status: false, message: "Unauthorized" })
        const rows = await db
            .select()
            .from(userRoles)
            .where(eq(userRoles.user_id, target.id))
        expect(rows).toHaveLength(0)
    })

    it("rejects authenticated users without the admin role", async () => {
        const target = await createUser()
        await createUserWithRoles([{ role: "captain" }])

        const result = await addUserRole({ userId: target.id, role: "referee" })

        expect(result).toEqual({ status: false, message: "Unauthorized" })
        const rows = await db
            .select()
            .from(userRoles)
            .where(eq(userRoles.user_id, target.id))
        expect(rows).toHaveLength(0)
    })

    it("lets an admin grant a role, writes an audit entry, and revalidates", async () => {
        const target = await createUser()
        const admin = await createUserWithRoles([{ role: "admin" }])

        const result = await addUserRole({ userId: target.id, role: "captain" })

        expect(result.status).toBe(true)

        const rows = await db
            .select()
            .from(userRoles)
            .where(eq(userRoles.user_id, target.id))
        expect(rows).toHaveLength(1)
        expect(rows[0].role).toBe("captain")
        expect(rows[0].season_id).toBeNull()
        expect(rows[0].granted_by).toBe(admin.id)

        const audit = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, admin.id))
        expect(audit).toHaveLength(1)
        expect(audit[0].action).toBe("create")
        expect(audit[0].entity_type).toBe("user_roles")

        expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(
            "/dashboard/manage-roles"
        )
    })

    it("does not create duplicate role rows when granted twice", async () => {
        const target = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        await addUserRole({ userId: target.id, role: "captain" })
        await addUserRole({ userId: target.id, role: "captain" })

        const rows = await db
            .select()
            .from(userRoles)
            .where(eq(userRoles.user_id, target.id))
        expect(rows).toHaveLength(1)
    })
})

describe("removeUserRole", () => {
    it("rejects non-admin callers", async () => {
        const target = await createUserWithRoles([{ role: "captain" }])
        const [roleRow] = await db
            .select()
            .from(userRoles)
            .where(eq(userRoles.user_id, target.id))
        // target is logged in but not an admin
        const result = await removeUserRole({
            userId: target.id,
            roleRowId: roleRow.id,
            role: "captain"
        })

        expect(result).toEqual({ status: false, message: "Unauthorized" })
        const remaining = await db
            .select()
            .from(userRoles)
            .where(eq(userRoles.user_id, target.id))
        expect(remaining).toHaveLength(1)
    })

    it("removes the targeted role row for an admin", async () => {
        const target = await createUser()
        await createUserWithRoles([{ role: "admin" }])
        await addUserRole({ userId: target.id, role: "referee" })

        const [roleRow] = await db
            .select()
            .from(userRoles)
            .where(eq(userRoles.user_id, target.id))
        const result = await removeUserRole({
            userId: target.id,
            roleRowId: roleRow.id,
            role: "referee"
        })

        expect(result.status).toBe(true)
        const remaining = await db
            .select()
            .from(userRoles)
            .where(eq(userRoles.user_id, target.id))
        expect(remaining).toHaveLength(0)
    })

    it("invalidates the user's sessions when their admin role is revoked", async () => {
        const target = await createUser()
        await createUserWithRoles([{ role: "admin" }])
        await addUserRole({ userId: target.id, role: "admin" })

        const now = new Date()
        await db.insert(sessions).values({
            id: "session-under-test",
            token: "token-under-test",
            userId: target.id,
            expiresAt: new Date(now.getTime() + 60_000),
            createdAt: now,
            updatedAt: now
        })

        const [roleRow] = await db
            .select()
            .from(userRoles)
            .where(eq(userRoles.user_id, target.id))
        const result = await removeUserRole({
            userId: target.id,
            roleRowId: roleRow.id,
            role: "admin"
        })

        expect(result.status).toBe(true)
        const liveSessions = await db
            .select()
            .from(sessions)
            .where(eq(sessions.userId, target.id))
        expect(liveSessions).toHaveLength(0)
    })
})

describe("getSeasonOptions", () => {
    it("returns nothing for non-admin callers", async () => {
        await createUserWithRoles([{ role: "captain" }])
        expect(await getSeasonOptions()).toEqual([])
    })
})
