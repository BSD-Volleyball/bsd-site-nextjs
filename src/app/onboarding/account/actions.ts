"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"

export interface OnboardingAccountData {
    preffered_name: string | null
    phone: string | null
    pronouns: string | null
    emergency_contact: string | null
    male: boolean | null
    referred_by: string | null
}

export async function getOnboardingAccountData(): Promise<OnboardingAccountData | null> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return null
    }

    const [profile] = await db
        .select({
            preffered_name: users.preffered_name,
            phone: users.phone,
            pronouns: users.pronouns,
            emergency_contact: users.emergency_contact,
            male: users.male,
            referred_by: users.referred_by
        })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)

    return profile ?? null
}

export async function updateOnboardingAccount(
    data: OnboardingAccountData
): Promise<{ status: boolean; message: string }> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return { status: false, message: "You need to be logged in." }
    }

    try {
        // If preferred name matches first name, clear it
        const [currentUser] = await db
            .select({ first_name: users.first_name })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1)

        const prefferedName =
            data.preffered_name &&
            data.preffered_name.trim().toLowerCase() ===
                currentUser?.first_name?.toLowerCase()
                ? null
                : data.preffered_name || null

        await db
            .update(users)
            .set({
                preffered_name: prefferedName,
                phone: data.phone || null,
                pronouns: data.pronouns || null,
                emergency_contact: data.emergency_contact || null,
                male: data.male,
                referred_by: data.referred_by || null,
                updatedAt: new Date()
            })
            .where(eq(users.id, session.user.id))

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "users",
            entityId: session.user.id,
            summary: "Updated onboarding account details"
        })

        return { status: true, message: "Account updated successfully!" }
    } catch (error) {
        console.error("Error updating onboarding account:", error)
        return { status: false, message: "Something went wrong." }
    }
}
