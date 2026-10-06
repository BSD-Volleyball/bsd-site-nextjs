"use server"

import { db } from "@/database/db"
import { users } from "@/database/schema"
import { and, eq, ne, sql } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { withAction, ok, fail, requireSession } from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"

export interface AccountProfileData {
    first_name: string | null
    last_name: string | null
    preferred_name: string | null
    email: string | null
    phone: string | null
    emergency_contact: string | null
    pronouns: string | null
}

export const getAccountProfile = withAction(
    async (): Promise<ActionResult<AccountProfileData | null>> => {
        const session = await requireSession()

        const [user] = await db
            .select({
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name,
                email: users.email,
                phone: users.phone,
                emergency_contact: users.emergency_contact,
                pronouns: users.pronouns
            })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1)

        return ok(user || null)
    }
)

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

        await db
            .update(users)
            .set({
                first_name: data.first_name || "",
                last_name: data.last_name || "",
                preferred_name: data.preferred_name,
                email,
                // A new address is unproven. Leaving it marked verified would
                // let someone claim another person's address and have that
                // person's Google sign-in link into this account.
                ...(emailChanged ? { emailVerified: false } : {}),
                phone: data.phone,
                emergency_contact: data.emergency_contact,
                pronouns: data.pronouns,
                name: fullName,
                updatedAt: new Date()
            })
            .where(eq(users.id, session.user.id))

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
