"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { checkSignupEligibility } from "@/lib/site-config"
import { db } from "@/database/db"
import { users, waitlist } from "@/database/schema"
import { eq, and } from "drizzle-orm"

export async function getSignupEligibility(): Promise<boolean> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return false
    }

    return checkSignupEligibility(session.user.id)
}

export async function getIsAdminOrDirector(): Promise<boolean> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return false
    }

    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)

    return user?.role === "admin" || user?.role === "director"
}

export async function expressWaitlistInterest(
    seasonId: number
): Promise<{ status: boolean; message: string }> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return { status: false, message: "Not authenticated." }
    }

    try {
        // Check if user is already on the waitlist for this season
        const [existing] = await db
            .select({ id: waitlist.id })
            .from(waitlist)
            .where(
                and(
                    eq(waitlist.season, seasonId),
                    eq(waitlist.user, session.user.id)
                )
            )
            .limit(1)

        if (existing) {
            return {
                status: false,
                message: "You've already expressed interest for this season."
            }
        }

        await db.insert(waitlist).values({
            season: seasonId,
            user: session.user.id,
            created_at: new Date()
        })

        return {
            status: true,
            message:
                "Your interest has been recorded. We'll reach out if a spot opens up!"
        }
    } catch (error) {
        console.error("Failed to express waitlist interest:", error)
        return {
            status: false,
            message: "Something went wrong. Please try again."
        }
    }
}
