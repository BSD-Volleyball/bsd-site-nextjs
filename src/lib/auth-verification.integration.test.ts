import { eq, like } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { accounts, sessions, users, verifications } from "@/database/schema"
import { createUser } from "@/test/session"
import {
    claimOnVerification,
    detachUnprovenSocialLogins,
    evictPreVerificationCredentials,
    markEmailChanged,
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
            accountsRemoved: true
        })
        expect(
            await db.select().from(sessions).where(eq(sessions.userId, user.id))
        ).toHaveLength(0)
        expect(
            await db.select().from(accounts).where(eq(accounts.userId, user.id))
        ).toHaveLength(0)
    })

    // A Google row signs its holder in by provider id whatever address the
    // user row now carries, so after someone else proves the address it is
    // as much a way in as the password was.
    it("removes social logins too", async () => {
        const user = await createUser({ emailVerified: false })
        await seedGoogleAccount(user.id)

        const result = await evictPreVerificationCredentials(user.id)

        expect(result).toEqual({
            sessionsRevoked: false,
            accountsRemoved: true
        })
        expect(
            await db.select().from(accounts).where(eq(accounts.userId, user.id))
        ).toHaveLength(0)
    })

    it("reports when there was nothing to evict", async () => {
        const user = await createUser({ emailVerified: false })

        expect(await evictPreVerificationCredentials(user.id)).toEqual({
            sessionsRevoked: false,
            accountsRemoved: false
        })
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

        await markEmailVerified(user.id, user.email)

        const [row] = await db
            .select({ emailVerified: users.emailVerified })
            .from(users)
            .where(eq(users.id, user.id))
        expect(row.emailVerified).toBe(true)
    })

    // The reset token is keyed by user id, so the address on the row may have
    // changed since the reset ran; only the address the reset saw is verified.
    it("does nothing when the address has changed since the reset", async () => {
        const user = await createUser({ emailVerified: false })

        await markEmailVerified(user.id, "old-address@example.test")

        const [row] = await db
            .select({ emailVerified: users.emailVerified })
            .from(users)
            .where(eq(users.id, user.id))
        expect(row.emailVerified).toBe(false)
    })
})

// The decision afterEmailVerification (src/lib/auth.ts) makes with the
// clicker's session: the person who signed up in this browser keeps their
// password; anyone else's click evicts whoever set it.
describe("claimOnVerification", () => {
    async function remaining(userId: string) {
        return {
            sessions: (
                await db
                    .select()
                    .from(sessions)
                    .where(eq(sessions.userId, userId))
            ).length,
            accounts: (
                await db
                    .select()
                    .from(accounts)
                    .where(eq(accounts.userId, userId))
            ).length
        }
    }

    it("keeps everything when the clicker is signed in as that user", async () => {
        const user = await createUser({ emailVerified: false })
        await seedCredentialAccount(user.id)
        await seedSession(user.id)

        expect(await claimOnVerification(user.id, user.id)).toBe(false)
        expect(await remaining(user.id)).toEqual({ sessions: 1, accounts: 1 })
    })

    it("evicts when the clicker is signed in as someone else", async () => {
        const user = await createUser({ emailVerified: false })
        const other = await createUser()
        await seedCredentialAccount(user.id)
        await seedSession(user.id)

        expect(await claimOnVerification(user.id, other.id)).toBe(true)
        expect(await remaining(user.id)).toEqual({ sessions: 0, accounts: 0 })
    })

    it("evicts when the clicker has no session", async () => {
        const user = await createUser({ emailVerified: false })
        await seedCredentialAccount(user.id)
        await seedSession(user.id)

        expect(await claimOnVerification(user.id, null)).toBe(true)
        expect(await remaining(user.id)).toEqual({ sessions: 0, accounts: 0 })
    })

    // The Settings path of the pre-account hijack: sign up with Google, then
    // re-point the address at a stranger's. When the stranger proves the
    // address the Google login must go with the sessions.
    it("evicts the Google login of a user who re-pointed their address", async () => {
        const user = await createUser({ emailVerified: false })
        await seedGoogleAccount(user.id)
        await seedSession(user.id)

        await expect(claimOnVerification(user.id, null)).resolves.toBe(true)
        expect(await remaining(user.id)).toEqual({ sessions: 0, accounts: 0 })
    })
})

// The reset path of the same hijack: the victim recovers through "forgot
// password" (what /auth/error offers), so the reset must also drop a Google
// login that was linked while the address was unproven.
describe("detachUnprovenSocialLogins", () => {
    it("removes social logins when the address was unverified", async () => {
        const user = await createUser({ emailVerified: false })
        await seedGoogleAccount(user.id)
        await seedCredentialAccount(user.id)

        expect(await detachUnprovenSocialLogins(user.id, false)).toBe(true)
        const remaining = await db
            .select({ providerId: accounts.providerId })
            .from(accounts)
            .where(eq(accounts.userId, user.id))
        expect(remaining).toEqual([{ providerId: "credential" }])
    })

    it("keeps social logins linked while the address was verified", async () => {
        const user = await createUser({ emailVerified: true })
        await seedGoogleAccount(user.id)

        expect(await detachUnprovenSocialLogins(user.id, true)).toBe(false)
        expect(
            await db.select().from(accounts).where(eq(accounts.userId, user.id))
        ).toHaveLength(1)
    })
})

describe("markEmailChanged", () => {
    it("drops emailVerified and revokes the user's reset tokens only", async () => {
        const user = await createUser({ emailVerified: true })
        const other = await createUser()
        await db.insert(verifications).values([
            {
                id: crypto.randomUUID(),
                identifier: "reset-password:tok-mine",
                value: user.id,
                expiresAt: new Date(Date.now() + 60_000)
            },
            {
                id: crypto.randomUUID(),
                identifier: `${user.email}-change-email`,
                value: user.id,
                expiresAt: new Date(Date.now() + 60_000)
            },
            {
                id: crypto.randomUUID(),
                identifier: "reset-password:tok-other",
                value: other.id,
                expiresAt: new Date(Date.now() + 60_000)
            }
        ])

        await markEmailChanged(db, user.id)

        const [row] = await db
            .select({ emailVerified: users.emailVerified })
            .from(users)
            .where(eq(users.id, user.id))
        expect(row.emailVerified).toBe(false)
        const left = await db
            .select({ identifier: verifications.identifier })
            .from(verifications)
            .where(like(verifications.identifier, "%tok-%"))
        expect(left.map((v) => v.identifier).sort()).toEqual([
            "reset-password:tok-other"
        ])
        expect(
            await db
                .select()
                .from(verifications)
                .where(eq(verifications.value, user.id))
        ).toHaveLength(1)
    })
})
