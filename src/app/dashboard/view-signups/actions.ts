"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users, signups, seasons, drafts } from "@/database/schema"
import { eq, and, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"

export interface SignupEntry {
    signupId: number
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    email: string
    male: boolean | null
    age: string | null
    captain: string | null
    amountPaid: string | null
    signupDate: Date
    isNew: boolean
}

async function checkAdminAccess(): Promise<boolean> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) return false

    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)

    return user?.role === "admin" || user?.role === "director"
}

export async function getSeasonSignups(): Promise<{
    status: boolean
    message?: string
    signups: SignupEntry[]
    seasonLabel: string
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            signups: [],
            seasonLabel: ""
        }
    }

    try {
        const config = await getSeasonConfig()

        const [season] = await db
            .select({ id: seasons.id })
            .from(seasons)
            .where(
                and(
                    eq(seasons.year, config.seasonYear),
                    eq(seasons.season, config.seasonName)
                )
            )
            .limit(1)

        if (!season) {
            return {
                status: false,
                message: "No current season found.",
                signups: [],
                seasonLabel: ""
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        const signupRows = await db
            .select({
                signupId: signups.id,
                userId: signups.player,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name,
                email: users.email,
                male: users.male,
                age: signups.age,
                captain: signups.captain,
                amountPaid: signups.amount_paid,
                signupDate: signups.created_at
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, season.id))
            .orderBy(signups.created_at)

        // Determine which users are new (no entry in drafts table)
        const userIds = signupRows.map((r) => r.userId)
        let draftedUserIds = new Set<string>()

        if (userIds.length > 0) {
            const draftedUsers = await db
                .select({ user: drafts.user })
                .from(drafts)
                .where(inArray(drafts.user, userIds))

            draftedUserIds = new Set(draftedUsers.map((d) => d.user))
        }

        const entries: SignupEntry[] = signupRows.map((row) => ({
            ...row,
            isNew: !draftedUserIds.has(row.userId)
        }))

        return {
            status: true,
            signups: entries,
            seasonLabel
        }
    } catch (error) {
        console.error("Error fetching season signups:", error)
        return {
            status: false,
            message: "Something went wrong.",
            signups: [],
            seasonLabel: ""
        }
    }
}
