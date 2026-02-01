"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"

export interface AccountProfileData {
    first_name: string | null
    last_name: string | null
    preffered_name: string | null
    phone: string | null
    emergency_contact: string | null
    pronouns: string | null
}

export async function getAccountProfile(): Promise<{
    status: boolean
    message?: string
    profile: AccountProfileData | null
}> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return {
            status: false,
            message: "You need to be logged in.",
            profile: null
        }
    }

    try {
        const [user] = await db
            .select({
                first_name: users.first_name,
                last_name: users.last_name,
                preffered_name: users.preffered_name,
                phone: users.phone,
                emergency_contact: users.emergency_contact,
                pronouns: users.pronouns
            })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1)

        return {
            status: true,
            profile: user || null
        }
    } catch (error) {
        console.error("Error fetching account profile:", error)
        return {
            status: false,
            message: "Something went wrong.",
            profile: null
        }
    }
}

export async function updateAccountField(
    field: keyof AccountProfileData,
    value: string | null
): Promise<{ status: boolean; message: string }> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return { status: false, message: "You need to be logged in." }
    }

    const allowedFields: (keyof AccountProfileData)[] = [
        "first_name",
        "last_name",
        "preffered_name",
        "phone",
        "emergency_contact",
        "pronouns"
    ]

    if (!allowedFields.includes(field)) {
        return { status: false, message: "Invalid field." }
    }

    try {
        await db
            .update(users)
            .set({
                [field]: value,
                updatedAt: new Date()
            })
            .where(eq(users.id, session.user.id))

        return { status: true, message: "Updated successfully!" }
    } catch (error) {
        console.error("Error updating account field:", error)
        return { status: false, message: "Something went wrong." }
    }
}
