import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { users, verifications } from "@/database/schema"
import { createUser, createUserWithRoles } from "@/test/session"
import { updateUser } from "./actions"

async function seedResetToken(userId: string) {
    await db.insert(verifications).values({
        id: crypto.randomUUID(),
        identifier: `reset-password:${crypto.randomUUID()}`,
        value: userId,
        expiresAt: new Date(Date.now() + 60_000)
    })
}

async function resetTokens(userId: string) {
    return db
        .select()
        .from(verifications)
        .where(eq(verifications.value, userId))
}

// An admin-typed address is as unproven as a self-typed one, so the admin
// edit follows the Settings rules (src/lib/auth-verification.ts).
describe("updateUser email handling", () => {
    it("drops emailVerified and revokes reset tokens when the address changes", async () => {
        const player = await createUser({ emailVerified: true })
        await seedResetToken(player.id)
        await createUserWithRoles([{ role: "admin" }])

        const result = await updateUser(player.id, {
            email: "  Fixed.Address@Example.test ",
            // The form resubmits the loaded value; it must not win.
            emailVerified: true
        })
        expect(result.status).toBe(true)

        const [row] = await db
            .select({ email: users.email, emailVerified: users.emailVerified })
            .from(users)
            .where(eq(users.id, player.id))
        expect(row).toEqual({
            email: "fixed.address@example.test",
            emailVerified: false
        })
        expect(await resetTokens(player.id)).toHaveLength(0)
    })

    it("lets an admin mark the unchanged address verified", async () => {
        const player = await createUser({ emailVerified: false })
        await seedResetToken(player.id)
        await createUserWithRoles([{ role: "admin" }])

        const result = await updateUser(player.id, {
            email: player.email.toUpperCase(),
            emailVerified: true
        })
        expect(result.status).toBe(true)

        const [row] = await db
            .select({ emailVerified: users.emailVerified })
            .from(users)
            .where(eq(users.id, player.id))
        expect(row.emailVerified).toBe(true)
        expect(await resetTokens(player.id)).toHaveLength(1)
    })
})
