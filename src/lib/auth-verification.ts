import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { accounts, sessions, users } from "@/database/schema"

/**
 * Account-claim rules behind better-auth's email verification.
 *
 * A password account can be created for an address its creator does not
 * own (nothing stops someone registering a stranger's email). The
 * verification link is mailed to the real address, so whoever clicks it has
 * proven inbox ownership and must end up as the sole holder of the account:
 * every session created before verification is revoked and the password
 * (the `credential` accounts row) is removed. A verifier who already holds
 * a session for the user is the person who signed up in this browser, and
 * `src/lib/auth.ts` skips the eviction for them.
 *
 * Without this, verifying an attacker-registered account hands the attacker
 * a password into the victim's future account (the "pre-account hijack").
 */
export async function evictPreVerificationCredentials(
    userId: string
): Promise<{ sessionsRevoked: boolean; credentialRemoved: boolean }> {
    return db.transaction(async (tx) => {
        const revoked = await tx
            .delete(sessions)
            .where(eq(sessions.userId, userId))
            .returning({ id: sessions.id })
        const removed = await tx
            .delete(accounts)
            .where(
                and(
                    eq(accounts.userId, userId),
                    eq(accounts.providerId, "credential")
                )
            )
            .returning({ id: accounts.id })
        return {
            sessionsRevoked: revoked.length > 0,
            credentialRemoved: removed.length > 0
        }
    })
}

/**
 * A password-reset link is delivered to the same inbox a verification link
 * is, so completing a reset proves ownership of the address just as well.
 */
export async function markEmailVerified(userId: string): Promise<void> {
    await db
        .update(users)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(eq(users.id, userId))
}
