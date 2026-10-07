import { describe, expect, it, vi } from "vitest"
import { eq, like } from "drizzle-orm"
import { db } from "@/database/db"
import { users, verifications } from "@/database/schema"
import { auth } from "@/lib/auth"
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

describe("updateAccountProfile verification challenge", () => {
    // The mocked auth module (setup.integration.ts) has no
    // sendVerificationEmail; attach a spy so the call can be asserted.
    function spyOnVerificationEmail() {
        const spy = vi.fn(async () => ({ status: true }))
        ;(auth.api as Record<string, unknown>).sendVerificationEmail = spy
        return spy
    }

    it("sends a verification link to the new address when it changes", async () => {
        const spy = spyOnVerificationEmail()
        const user = await createUser({ emailVerified: true })
        loginAs(user)

        const result = await updateAccountProfile(
            profile({ email: "Changed.Address@Example.test" })
        )

        expect(result.status).toBe(true)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({
                body: expect.objectContaining({
                    email: "changed.address@example.test"
                })
            })
        )
    })

    it("sends nothing when the address is unchanged", async () => {
        const spy = spyOnVerificationEmail()
        const user = await createUser({ emailVerified: true })
        loginAs(user)

        await updateAccountProfile(profile({ email: user.email }))

        expect(spy).not.toHaveBeenCalled()
    })

    it("still saves the profile when the email cannot be sent", async () => {
        ;(auth.api as Record<string, unknown>).sendVerificationEmail = vi.fn(
            async () => {
                throw new Error("postmark down")
            }
        )
        const user = await createUser({ emailVerified: true })
        loginAs(user)

        const result = await updateAccountProfile(
            profile({ email: "unsendable@example.test" })
        )

        expect(result.status).toBe(true)
        expect((await reload(user.id)).email).toBe("unsendable@example.test")
    })
})

// better-auth keys a reset token by user id, not by the address it was mailed
// to, and completing a reset marks the email verified (src/lib/auth.ts). A
// token requested for the old address must therefore die when the address
// changes, or its holder could verify an address they never received mail at.
describe("updateAccountProfile password-reset tokens", () => {
    async function seedResetToken(userId: string) {
        const token = crypto.randomUUID()
        await db.insert(verifications).values({
            id: crypto.randomUUID(),
            identifier: `reset-password:${token}`,
            value: userId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000)
        })
    }

    async function resetTokensFor(userId: string) {
        return db
            .select()
            .from(verifications)
            .where(like(verifications.identifier, "reset-password:%"))
            .then((rows) => rows.filter((r) => r.value === userId))
    }

    it("revokes outstanding reset tokens when the address changes", async () => {
        const user = await createUser({ emailVerified: true })
        const bystander = await createUser()
        await seedResetToken(user.id)
        await seedResetToken(bystander.id)
        loginAs(user)

        const result = await updateAccountProfile(
            profile({ email: "victim@example.test" })
        )

        expect(result.status).toBe(true)
        expect(await resetTokensFor(user.id)).toHaveLength(0)
        expect(await resetTokensFor(bystander.id)).toHaveLength(1)
    })

    it("keeps reset tokens when the address is unchanged", async () => {
        const user = await createUser({ emailVerified: true })
        await seedResetToken(user.id)
        loginAs(user)

        await updateAccountProfile(profile({ email: user.email }))

        expect(await resetTokensFor(user.id)).toHaveLength(1)
    })
})
