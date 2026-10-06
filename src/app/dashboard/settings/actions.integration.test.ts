import { describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { createUser, loginAs } from "@/test/session"
import { type AccountProfileData, updateAccountProfile } from "./actions"

function profile(
    overrides: Partial<AccountProfileData> = {}
): AccountProfileData {
    return {
        first_name: "Test",
        last_name: "User",
        preferred_name: null,
        email: null,
        phone: null,
        emergency_contact: null,
        pronouns: null,
        ...overrides
    }
}

async function reload(id: string) {
    const [row] = await db.select().from(users).where(eq(users.id, id))
    return row
}

describe("updateAccountProfile email handling", () => {
    it("clears emailVerified when the address changes", async () => {
        const user = await createUser({ emailVerified: true })
        loginAs(user)

        const result = await updateAccountProfile(
            profile({ email: "  New.Address@Example.test " })
        )
        expect(result.status).toBe(true)

        const row = await reload(user.id)
        expect(row.email).toBe("new.address@example.test")
        expect(row.emailVerified).toBe(false)
    })

    it("keeps emailVerified when only the casing is resubmitted", async () => {
        const user = await createUser({ emailVerified: true })
        loginAs(user)

        const result = await updateAccountProfile(
            profile({ email: user.email.toUpperCase() })
        )
        expect(result.status).toBe(true)
        expect((await reload(user.id)).emailVerified).toBe(true)
    })

    it("refuses a blank email instead of storing an empty string", async () => {
        const user = await createUser()
        loginAs(user)

        const result = await updateAccountProfile(profile({ email: "  " }))
        expect(result.status).toBe(false)
        expect((await reload(user.id)).email).toBe(user.email)
    })

    it("refuses an address another account already uses, in any casing", async () => {
        const other = await createUser()
        const user = await createUser()
        loginAs(user)

        const result = await updateAccountProfile(
            profile({ email: other.email.toUpperCase() })
        )
        expect(result).toEqual({
            status: false,
            message: "That email address can't be used."
        })
        expect((await reload(user.id)).email).toBe(user.email)
    })
})
