"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"

export interface AccountProfileData {
    first_name: string | null
    last_name: string | null
    preffered_name: string | null
    email: string | null
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
                email: users.email,
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
        // If updating first_name or last_name, also update the name field
        if (field === "first_name" || field === "last_name") {
            // Fetch current values
            const [currentUser] = await db
                .select({
                    first_name: users.first_name,
                    last_name: users.last_name
                })
                .from(users)
                .where(eq(users.id, session.user.id))
                .limit(1)

            const firstName =
                field === "first_name"
                    ? value || ""
                    : currentUser?.first_name || ""
            const lastName =
                field === "last_name"
                    ? value || ""
                    : currentUser?.last_name || ""
            const fullName = `${firstName} ${lastName}`.trim()

            await db
                .update(users)
                .set({
                    [field]: value,
                    name: fullName,
                    updatedAt: new Date()
                })
                .where(eq(users.id, session.user.id))
        } else {
            await db
                .update(users)
                .set({
                    [field]: value,
                    updatedAt: new Date()
                })
                .where(eq(users.id, session.user.id))
        }

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "users",
            entityId: session.user.id,
            summary: `Updated account field: ${field}`
        })

        return { status: true, message: "Updated successfully!" }
    } catch (error) {
        console.error("Error updating account field:", error)
        return { status: false, message: "Something went wrong." }
    }
}

export async function updateAccountProfile(
    data: AccountProfileData
): Promise<{ status: boolean; message: string }> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return { status: false, message: "You need to be logged in." }
    }

    try {
        // Validate email if provided
        if (data.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            if (!emailRegex.test(data.email)) {
                return {
                    status: false,
                    message: "Please enter a valid email address."
                }
            }
        }

        const fullName =
            `${data.first_name || ""} ${data.last_name || ""}`.trim()

        await db
            .update(users)
            .set({
                first_name: data.first_name || "",
                last_name: data.last_name || "",
                preffered_name: data.preffered_name,
                email: data.email || "",
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

        return { status: true, message: "Profile updated successfully!" }
    } catch (error) {
        console.error("Error updating account profile:", error)
        return { status: false, message: "Something went wrong." }
    }
}
