import "server-only"
import { and, eq, like, ne } from "drizzle-orm"
import { db } from "@/database/db"
import { accounts, sessions, users, verifications } from "@/database/schema"

type Executor = Pick<typeof db, "delete" | "update">

/**
 * Account-claim rules behind better-auth's email verification.
 *
 * A password account can be created for an address its creator does not
 * own (nothing stops someone registering a stranger's email), and Settings
 * lets any account re-point its address at one nobody has proven. The
 * verification link is mailed to the real address, so whoever clicks it has
 * proven inbox ownership and must end up as the sole holder of the account:
 * every session created before verification is revoked and every way back
 * in is removed — the password (`credential` row) and any social login.
 * A Google row is bound to whoever signed in with Google, not to the address
 * now on the user row, so after a claim it would still let that person in.
 * A verifier who already holds a session for the user is the person who
 * signed up in this browser, and `src/lib/auth.ts` skips the eviction for
 * them.
 *
 * Without this, verifying an attacker-registered account hands the attacker
 * a password (or a Google login) into the victim's future account.
 */
export async function evictPreVerificationCredentials(
    userId: string
): Promise<{ sessionsRevoked: boolean; accountsRemoved: boolean }> {
    return db.transaction(async (tx) => {
        const revoked = await tx
            .delete(sessions)
            .where(eq(sessions.userId, userId))
            .returning({ id: sessions.id })
        const removed = await tx
            .delete(accounts)
            .where(eq(accounts.userId, userId))
            .returning({ id: accounts.id })
        return {
            sessionsRevoked: revoked.length > 0,
            accountsRemoved: removed.length > 0
        }
    })
}

/**
 * The afterEmailVerification decision. `verifierUserId` is the user the
 * clicker's browser is signed in as (null when signed out). Only someone
 * already signed in as this user is the person who signed up there and keeps
 * the password; any other click evicts. Returns whether it evicted.
 */
export async function claimOnVerification(
    userId: string,
    verifierUserId: string | null
): Promise<boolean> {
    if (verifierUserId === userId) return false
    await evictPreVerificationCredentials(userId)
    return true
}

/**
 * Social logins that pre-date a password reset. A reset link reaches the
 * inbox the row names, so completing one proves that address — but a Google
 * row linked while the row carried an *unproven* address was proven by
 * nobody, and keeps signing its holder in by provider id whatever the email
 * now says. `wasVerified` is the row's `emailVerified` before the reset: a
 * verified address was proven when the social login linked, so that link
 * stays.
 */
export async function detachUnprovenSocialLogins(
    userId: string,
    wasVerified: boolean
): Promise<boolean> {
    if (wasVerified) return false
    const removed = await db
        .delete(accounts)
        .where(
            and(
                eq(accounts.userId, userId),
                ne(accounts.providerId, "credential")
            )
        )
        .returning({ id: accounts.id })
    return removed.length > 0
}

/**
 * Bookkeeping for a change of address on a user row (Settings or an admin
 * edit). The new address is unproven, so `emailVerified` drops. better-auth
 * keys a reset token by user id, not by the address it was mailed to, and a
 * completed reset marks the email verified (onPasswordReset in
 * src/lib/auth.ts), so a token requested for the old address must not
 * survive the change or its holder could verify an address they never
 * received mail at.
 */
export async function markEmailChanged(
    executor: Executor,
    userId: string
): Promise<void> {
    await executor
        .update(users)
        .set({ emailVerified: false, updatedAt: new Date() })
        .where(eq(users.id, userId))
    await executor
        .delete(verifications)
        .where(
            and(
                like(verifications.identifier, "reset-password:%"),
                eq(verifications.value, userId)
            )
        )
}

/**
 * A password-reset link is delivered to the same inbox a verification link
 * is, so completing a reset proves ownership of the address just as well.
 *
 * better-auth keys a reset token by user id, not by the address it was
 * mailed to, so the row's address may have changed since. `email` is the
 * address the reset completed against (the user row better-auth loaded);
 * the update only applies while the row still holds it. Settings also
 * revokes outstanding reset tokens when the address changes.
 */
export async function markEmailVerified(
    userId: string,
    email: string
): Promise<void> {
    await db
        .update(users)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(and(eq(users.id, userId), eq(users.email, email)))
}
