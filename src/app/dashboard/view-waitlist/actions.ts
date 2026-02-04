"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    seasons,
    waitlist,
    drafts,
    teams,
    divisions
} from "@/database/schema"
import { eq, and, desc, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"

export interface WaitlistEntry {
    waitlistId: number
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    email: string
    male: boolean | null
    createdAt: Date
    lastDivision: string | null
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

export async function getSeasonWaitlist(): Promise<{
    status: boolean
    message?: string
    entries: WaitlistEntry[]
    seasonLabel: string
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            entries: [],
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
                entries: [],
                seasonLabel: ""
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        const rows = await db
            .select({
                waitlistId: waitlist.id,
                userId: waitlist.user,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name,
                email: users.email,
                male: users.male,
                createdAt: waitlist.created_at
            })
            .from(waitlist)
            .innerJoin(users, eq(waitlist.user, users.id))
            .where(eq(waitlist.season, season.id))
            .orderBy(waitlist.created_at)

        // Look up most recent division for each user from drafts
        const userIds = rows.map((r) => r.userId)
        const lastDivisionMap = new Map<string, string>()

        if (userIds.length > 0) {
            const draftRows = await db
                .select({
                    user: drafts.user,
                    divisionName: divisions.name,
                    seasonId: seasons.id
                })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .innerJoin(seasons, eq(teams.season, seasons.id))
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .where(inArray(drafts.user, userIds))
                .orderBy(desc(seasons.year), desc(seasons.id))

            // Keep only the first (most recent) per user
            for (const row of draftRows) {
                if (!lastDivisionMap.has(row.user)) {
                    lastDivisionMap.set(row.user, row.divisionName)
                }
            }
        }

        const entries: WaitlistEntry[] = rows.map((row) => ({
            ...row,
            lastDivision: lastDivisionMap.get(row.userId) ?? null
        }))

        return {
            status: true,
            entries,
            seasonLabel
        }
    } catch (error) {
        console.error("Error fetching season waitlist:", error)
        return {
            status: false,
            message: "Something went wrong.",
            entries: [],
            seasonLabel: ""
        }
    }
}
