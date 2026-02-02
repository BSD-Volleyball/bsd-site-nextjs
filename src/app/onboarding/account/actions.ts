"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"

export interface OnboardingAccountData {
    preffered_name: string | null
    phone: string | null
    pronouns: string | null
    emergency_contact: string | null
    male: boolean | null
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
            male: users.male
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
        await db
            .update(users)
            .set({
                preffered_name: data.preffered_name || null,
                phone: data.phone || null,
                pronouns: data.pronouns || null,
                emergency_contact: data.emergency_contact || null,
                male: data.male,
                updatedAt: new Date()
            })
            .where(eq(users.id, session.user.id))

        return { status: true, message: "Account updated successfully!" }
    } catch (error) {
        console.error("Error updating onboarding account:", error)
        return { status: false, message: "Something went wrong." }
    }
}
