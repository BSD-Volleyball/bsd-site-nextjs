import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { accounts, sessions, users } from "@/database/schema"
import { createUser } from "@/test/session"
import {
    evictPreVerificationCredentials,
    markEmailVerified
} from "./auth-verification"

async function seedCredentialAccount(userId: string) {
    await db.insert(accounts).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: "hashed-by-attacker"
    })
}

async function seedGoogleAccount(userId: string) {
    await db.insert(accounts).values({
        id: crypto.randomUUID(),
        accountId: `google-${userId}`,
        providerId: "google",
        userId
    })
}

async function seedSession(userId: string) {
    await db.insert(sessions).values({
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        userId,
        expiresAt: new Date(Date.now() + 60_000)
    })
}

describe("evictPreVerificationCredentials", () => {
    it("revokes every session and removes the password account", async () => {
        const user = await createUser({ emailVerified: false })
        await seedCredentialAccount(user.id)
        await seedSession(user.id)
        await seedSession(user.id)

        const result = await evictPreVerificationCredentials(user.id)

        expect(result).toEqual({
            sessionsRevoked: true,
            credentialRemoved: true
        })
        expect(
            await db.select().from(sessions).where(eq(sessions.userId, user.id))
        ).toHaveLength(0)
        expect(
            await db.select().from(accounts).where(eq(accounts.userId, user.id))
        ).toHaveLength(0)
    })

    it("keeps social accounts and reports when there was nothing to evict", async () => {
        const user = await createUser({ emailVerified: false })
        await seedGoogleAccount(user.id)

        const result = await evictPreVerificationCredentials(user.id)

        expect(result).toEqual({
            sessionsRevoked: false,
            credentialRemoved: false
        })
        const remaining = await db
            .select({ providerId: accounts.providerId })
            .from(accounts)
            .where(eq(accounts.userId, user.id))
        expect(remaining).toEqual([{ providerId: "google" }])
    })

    it("does not touch another user's sessions or accounts", async () => {
        const victim = await createUser({ emailVerified: false })
        const bystander = await createUser()
        await seedCredentialAccount(victim.id)
        await seedCredentialAccount(bystander.id)
        await seedSession(bystander.id)

        await evictPreVerificationCredentials(victim.id)

        expect(
            await db
                .select()
                .from(sessions)
                .where(eq(sessions.userId, bystander.id))
        ).toHaveLength(1)
        expect(
            await db
                .select()
                .from(accounts)
                .where(eq(accounts.userId, bystander.id))
        ).toHaveLength(1)
    })
})

describe("markEmailVerified", () => {
    it("flips emailVerified to true", async () => {
        const user = await createUser({ emailVerified: false })

        await markEmailVerified(user.id)

        const [row] = await db
            .select({ emailVerified: users.emailVerified })
            .from(users)
            .where(eq(users.id, user.id))
        expect(row.emailVerified).toBe(true)
    })
})
