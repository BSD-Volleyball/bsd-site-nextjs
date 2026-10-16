"use server"

import { db } from "@/database/db"
import { users } from "@/database/schema"
import { and, eq, ne, sql } from "drizzle-orm"
import { countRecentAuditEntries, logAuditEntry } from "@/lib/audit-log"
import { auth } from "@/lib/auth"
import { markEmailChanged } from "@/lib/auth-verification"
import { logger } from "@/lib/logger"
import { withAction, ok, fail, requireSession } from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"

const EMAIL_CHANGE_ACTION = "email_change"
const EMAIL_CHANGE_COOLDOWN_MINUTES = 10

export interface AccountProfileData {
    first_name: string | null
    last_name: string | null
    preferred_name: string | null
    email: string | null
    phone: string | null
    emergency_contact: string | null
    pronouns: string | null
}

export const updateAccountProfile = withAction(
    async (data: AccountProfileData): Promise<ActionResult> => {
        const session = await requireSession()

        // Stored lowercase, like the sign-up and Google paths, so one address
        // cannot exist twice under different casing.
        const email = (data.email ?? "").trim().toLowerCase()
        if (!email) {
            return fail("Please enter your email address.")
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            return fail("Please enter a valid email address.")
        }

        const [current] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1)
        const emailChanged = current?.email.toLowerCase() !== email

        if (emailChanged) {
            // Each change mails a verification link to whatever address was
            // typed, from the league's domain, with no CAPTCHA in the way.
            const recent = await countRecentAuditEntries({
                userId: session.user.id,
                action: EMAIL_CHANGE_ACTION,
                withinMinutes: EMAIL_CHANGE_COOLDOWN_MINUTES
            })
            if (recent > 0) {
                return fail(
                    `You changed your email address recently. Please wait ${EMAIL_CHANGE_COOLDOWN_MINUTES} minutes before changing it again.`
                )
            }

            const [taken] = await db
                .select({ id: users.id })
                .from(users)
                .where(
                    and(
                        sql`lower(${users.email}) = ${email}`,
                        ne(users.id, session.user.id)
                    )
                )
                .limit(1)
            if (taken) {
                return fail("That email address can't be used.")
            }
        }

        const fullName =
            `${data.first_name || ""} ${data.last_name || ""}`.trim()

        await db.transaction(async (tx) => {
            await tx
                .update(users)
                .set({
                    first_name: data.first_name || "",
                    last_name: data.last_name || "",
                    preferred_name: data.preferred_name,
                    email,
                    phone: data.phone,
                    emergency_contact: data.emergency_contact,
                    pronouns: data.pronouns,
                    name: fullName,
                    updatedAt: new Date()
                })
                .where(eq(users.id, session.user.id))

            // A new address is unproven: it drops emailVerified and revokes
            // reset tokens mailed to the old one. Whoever proves the new
            // address (verification link or reset) becomes its sole holder;
            // see src/lib/auth-verification.ts.
            if (emailChanged) {
                await markEmailChanged(tx, session.user.id)
            }
        })

        if (emailChanged) {
            // The new address is unverified until its owner clicks the link,
            // so send it now. Deliberately without this request's cookies:
            // the cached session cookie still carries the old address, and
            // better-auth refuses a session whose email differs from the
            // body. Verifying in this same browser still keeps the password,
            // because afterEmailVerification (src/lib/auth.ts) reads the
            // clicker's session at click time.
            try {
                await auth.api.sendVerificationEmail({
                    body: { email, callbackURL: "/dashboard/account" }
                })
            } catch (error) {
                logger.warn("[settings] verification email failed", {
                    userId: session.user.id,
                    error:
                        error instanceof Error ? error.message : String(error)
                })
            }
        }

        if (emailChanged) {
            // Its own entry: the throttle above counts these.
            await logAuditEntry({
                userId: session.user.id,
                action: EMAIL_CHANGE_ACTION,
                entityType: "users",
                entityId: session.user.id,
                summary: `Changed email address to ${email}`
            })
        }
        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "users",
            entityId: session.user.id,
            summary: "Updated account profile"
        })

        return ok(undefined, "Profile updated successfully!")
    }
)
