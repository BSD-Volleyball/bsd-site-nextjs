import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { auditLog, users } from "@/database/schema"
import { createUserWithRoles, logout } from "@/test/session"
import { getOnboardingAccountData, updateOnboardingAccount } from "./actions"

const accountData = {
    preferred_name: "Sam",
    phone: "555-0100",
    pronouns: "they/them",
    emergency_contact: "Alex 555-0111",
    male: false,
    referred_by: "A friend"
}

describe("getOnboardingAccountData", () => {
    it("returns null when logged out", async () => {
        logout()
        expect(await getOnboardingAccountData()).toBeNull()
    })

    it("returns the current user's profile fields", async () => {
        await createUserWithRoles([], { phone: "555-0199" })
        const data = await getOnboardingAccountData()
        expect(data?.phone).toBe("555-0199")
    })
})

describe("updateOnboardingAccount", () => {
    it("fails when not authenticated", async () => {
        const result = await updateOnboardingAccount(accountData)
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("persists profile fields and writes an audit entry", async () => {
        const user = await createUserWithRoles([])

        const result = await updateOnboardingAccount(accountData)

        expect(result.status).toBe(true)
        const [updated] = await db
            .select()
            .from(users)
            .where(eq(users.id, user.id))
        expect(updated.preferred_name).toBe("Sam")
        expect(updated.phone).toBe("555-0100")
        expect(updated.pronouns).toBe("they/them")
        expect(updated.male).toBe(false)

        const audit = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, user.id))
        expect(audit).toHaveLength(1)
        expect(audit[0].action).toBe("update")
    })

    it("clears the preferred name when it matches the first name", async () => {
        const user = await createUserWithRoles([], { first_name: "Jordan" })

        const result = await updateOnboardingAccount({
            ...accountData,
            preferred_name: "  jordan "
        })

        expect(result.status).toBe(true)
        const [updated] = await db
            .select()
            .from(users)
            .where(eq(users.id, user.id))
        expect(updated.preferred_name).toBeNull()
    })
})
