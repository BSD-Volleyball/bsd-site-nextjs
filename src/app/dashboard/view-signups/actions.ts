"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users, signups, drafts } from "@/database/schema"
import { eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"

export interface SignupEntry {
    signupId: number
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    age: string | null
    captain: string | null
    amountPaid: string | null
    signupDate: Date
    isNew: boolean
    pairPickName: string | null
    pairReason: string | null
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

        if (!config.seasonId) {
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
                male: users.male,
                age: signups.age,
                captain: signups.captain,
                amountPaid: signups.amount_paid,
                signupDate: signups.created_at,
                pairPickId: signups.pair_pick,
                pairReason: signups.pair_reason
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, config.seasonId))
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

        // Fetch pair pick user names
        const pairPickIds = signupRows
            .map((r) => r.pairPickId)
            .filter((id): id is string => id !== null)
        let pairPickNames = new Map<string, string>()

        if (pairPickIds.length > 0) {
            const pairPickUsers = await db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preffered_name
                })
                .from(users)
                .where(inArray(users.id, pairPickIds))

            pairPickNames = new Map(
                pairPickUsers.map((u) => {
                    const preferred = u.preferredName
                        ? ` (${u.preferredName})`
                        : ""
                    return [u.id, `${u.firstName}${preferred} ${u.lastName}`]
                })
            )
        }

        const entries: SignupEntry[] = signupRows.map((row) => ({
            signupId: row.signupId,
            userId: row.userId,
            firstName: row.firstName,
            lastName: row.lastName,
            preferredName: row.preferredName,
            male: row.male,
            age: row.age,
            captain: row.captain,
            amountPaid: row.amountPaid,
            signupDate: row.signupDate,
            isNew: !draftedUserIds.has(row.userId),
            pairPickName: row.pairPickId
                ? (pairPickNames.get(row.pairPickId) ?? null)
                : null,
            pairReason: row.pairReason
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
