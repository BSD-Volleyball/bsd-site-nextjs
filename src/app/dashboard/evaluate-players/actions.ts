"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    signups,
    drafts,
    evaluations,
    divisions
} from "@/database/schema"
import { eq, and, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"

export interface DivisionOption {
    id: number
    name: string
}

export interface NewPlayerEntry {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    experience: string | null
    assessment: string | null
    division: number | null
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
    divisions: DivisionOption[]
    seasonLabel: string
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            players: [],
            divisions: [],
            seasonLabel: ""
        }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                players: [],
                divisions: [],
                seasonLabel: ""
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        const allDivisions = await db
            .select({ id: divisions.id, name: divisions.name })
            .from(divisions)
            .where(eq(divisions.active, true))
            .orderBy(divisions.level)

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
            .where(eq(signups.season, config.seasonId))
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
        let evaluationMap = new Map<string, number>()

        if (newPlayerIds.length > 0) {
            const existingEvals = await db
                .select({
                    player: evaluations.player,
                    division: evaluations.division
                })
                .from(evaluations)
                .where(
                    and(
                        eq(evaluations.season, config.seasonId),
                        inArray(evaluations.player, newPlayerIds)
                    )
                )

            evaluationMap = new Map(
                existingEvals.map((e) => [e.player, e.division])
            )
        }

        const entries: NewPlayerEntry[] = newPlayers.map((row) => ({
            ...row,
            division: evaluationMap.get(row.userId) ?? null
        }))

        return {
            status: true,
            players: entries,
            divisions: allDivisions,
            seasonLabel
        }
    } catch (error) {
        console.error("Error fetching new players:", error)
        return {
            status: false,
            message: "Something went wrong.",
            players: [],
            divisions: [],
            seasonLabel: ""
        }
    }
}

export async function saveEvaluations(
    data: { playerId: string; division: number }[]
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        // Validate division IDs exist
        const divisionIds = [...new Set(data.map((d) => d.division))]
        const validDivisions = await db
            .select({ id: divisions.id })
            .from(divisions)
            .where(inArray(divisions.id, divisionIds))

        const validIds = new Set(validDivisions.map((d) => d.id))
        for (const entry of data) {
            if (!validIds.has(entry.division)) {
                return {
                    status: false,
                    message: `Invalid division ID: ${entry.division}`
                }
            }
        }

        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return { status: false, message: "No current season found." }
        }

        const playerIds = data.map((d) => d.playerId)

        // Delete existing evaluations for these players this season
        if (playerIds.length > 0) {
            await db
                .delete(evaluations)
                .where(
                    and(
                        eq(evaluations.season, config.seasonId),
                        inArray(evaluations.player, playerIds)
                    )
                )
        }

        // Insert new evaluations
        if (data.length > 0) {
            await db.insert(evaluations).values(
                data.map((entry) => ({
                    season: config.seasonId,
                    player: entry.playerId,
                    division: entry.division
                }))
            )
        }

        const session = await auth.api.getSession({ headers: await headers() })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "upsert",
                entityType: "evaluations",
                summary: `Saved ${data.length} player evaluations for current season`
            })
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
