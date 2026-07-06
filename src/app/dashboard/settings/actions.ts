"use server"

import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { withAction, ok, fail, requireSession } from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"

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

export const updateAccountField = withAction(
    async (
        field: keyof AccountProfileData,
        value: string | null
    ): Promise<ActionResult> => {
        const session = await requireSession()

        const allowedFields: (keyof AccountProfileData)[] = [
            "first_name",
            "last_name",
            "preferred_name",
            "phone",
            "emergency_contact",
            "pronouns"
        ]

        if (!allowedFields.includes(field)) {
            return fail("Invalid field.")
        }

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

        return ok(undefined, "Updated successfully!")
    }
)

export const updateAccountProfile = withAction(
    async (data: AccountProfileData): Promise<ActionResult> => {
        const session = await requireSession()

        // Validate email if provided
        if (data.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            if (!emailRegex.test(data.email)) {
                return fail("Please enter a valid email address.")
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

        return ok(undefined, "Profile updated successfully!")
    }
)
