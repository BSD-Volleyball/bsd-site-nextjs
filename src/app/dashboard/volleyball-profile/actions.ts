"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"

export interface VolleyballProfileData {
    experience: string | null
    assessment: string | null
    height: number | null
    skill_passer: boolean | null
    skill_setter: boolean | null
    skill_hitter: boolean | null
    skill_other: boolean | null
}

export async function getVolleyballProfile(): Promise<{
    status: boolean
    message?: string
    profile: VolleyballProfileData | null
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
                experience: users.experience,
                assessment: users.assessment,
                height: users.height,
                skill_passer: users.skill_passer,
                skill_setter: users.skill_setter,
                skill_hitter: users.skill_hitter,
                skill_other: users.skill_other
            })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1)

        return {
            status: true,
            profile: user || null
        }
    } catch (error) {
        console.error("Error fetching volleyball profile:", error)
        return {
            status: false,
            message: "Something went wrong.",
            profile: null
        }
    }
}

export async function updateVolleyballProfile(
    data: VolleyballProfileData
): Promise<{ status: boolean; message: string }> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
        return { status: false, message: "You need to be logged in." }
    }

    try {
        await db
            .update(users)
            .set({
                experience: data.experience,
                assessment: data.assessment,
                height: data.height,
                skill_passer: data.skill_passer,
                skill_setter: data.skill_setter,
                skill_hitter: data.skill_hitter,
                skill_other: data.skill_other,
                updatedAt: new Date()
            })
            .where(eq(users.id, session.user.id))

        return { status: true, message: "Profile updated successfully!" }
    } catch (error) {
        console.error("Error updating volleyball profile:", error)
        return { status: false, message: "Something went wrong." }
    }
}
