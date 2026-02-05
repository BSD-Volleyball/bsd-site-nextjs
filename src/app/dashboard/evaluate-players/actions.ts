"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users, signups, seasons, drafts, evaluations } from "@/database/schema"
import { eq, and, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"

const VALID_DIVISIONS = ["AA", "A", "ABA", "ABB", "BBB", "BB"] as const

export interface NewPlayerEntry {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    experience: string | null
    assessment: string | null
    division: string | null
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

export async function getNewPlayers(): Promise<{
    status: boolean
    message?: string
    players: NewPlayerEntry[]
    seasonLabel: string
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            players: [],
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
                players: [],
                seasonLabel: ""
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        // Get all signed up players for this season
        const signupRows = await db
            .select({
                userId: signups.player,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name,
                male: users.male,
                experience: users.experience,
                assessment: users.assessment
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, season.id))
            .orderBy(users.last_name, users.first_name)

        // Find which players have been drafted (not new)
        const userIds = signupRows.map((r) => r.userId)
        let draftedUserIds = new Set<string>()

        if (userIds.length > 0) {
            const draftedUsers = await db
                .select({ user: drafts.user })
                .from(drafts)
                .where(inArray(drafts.user, userIds))

            draftedUserIds = new Set(draftedUsers.map((d) => d.user))
        }

        // Filter to only new players
        const newPlayers = signupRows.filter(
            (r) => !draftedUserIds.has(r.userId)
        )

        // Get existing evaluations for this season
        const newPlayerIds = newPlayers.map((p) => p.userId)
        let evaluationMap = new Map<string, string>()

        if (newPlayerIds.length > 0) {
            const existingEvals = await db
                .select({
                    player: evaluations.player,
                    division: evaluations.division
                })
                .from(evaluations)
                .where(
                    and(
                        eq(evaluations.season, season.id),
                        inArray(evaluations.player, newPlayerIds)
                    )
                )

            evaluationMap = new Map(
                existingEvals.map((e) => [e.player, e.division])
            )
        }

        const entries: NewPlayerEntry[] = newPlayers.map((row) => ({
            ...row,
            division: evaluationMap.get(row.userId) || null
        }))

        return {
            status: true,
            players: entries,
            seasonLabel
        }
    } catch (error) {
        console.error("Error fetching new players:", error)
        return {
            status: false,
            message: "Something went wrong.",
            players: [],
            seasonLabel: ""
        }
    }
}

export async function saveEvaluations(
    data: { playerId: string; division: string }[]
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        // Validate divisions
        for (const entry of data) {
            if (!VALID_DIVISIONS.includes(entry.division as typeof VALID_DIVISIONS[number])) {
                return {
                    status: false,
                    message: `Invalid division: ${entry.division}`
                }
            }
        }

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
            return { status: false, message: "No current season found." }
        }

        const playerIds = data.map((d) => d.playerId)

        // Delete existing evaluations for these players this season
        if (playerIds.length > 0) {
            await db
                .delete(evaluations)
                .where(
                    and(
                        eq(evaluations.season, season.id),
                        inArray(evaluations.player, playerIds)
                    )
                )
        }

        // Insert new evaluations
        if (data.length > 0) {
            await db.insert(evaluations).values(
                data.map((entry) => ({
                    season: season.id,
                    player: entry.playerId,
                    division: entry.division
                }))
            )
        }

        return {
            status: true,
            message: "Evaluations saved successfully."
        }
    } catch (error) {
        console.error("Error saving evaluations:", error)
        return {
            status: false,
            message: "Failed to save evaluations."
        }
    }
}
