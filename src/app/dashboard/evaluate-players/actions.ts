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
    level: number
}

export interface EvaluatorDetail {
    evaluatorName: string
    divisionId: number
    divisionName: string
}

export interface NewPlayerEntry {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    experience: string | null
    assessment: string | null
    currentUserEvaluation: number | null
    averageEvaluation: number | null
    evaluationCount: number
    evaluatorDetails: EvaluatorDetail[]
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
            .select({
                id: divisions.id,
                name: divisions.name,
                level: divisions.level
            })
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

        // Get current user session
        const session = await auth.api.getSession({ headers: await headers() })
        const currentUserId = session?.user.id

        // Get existing evaluations for this season
        const newPlayerIds = newPlayers.map((p) => p.userId)
        const playerEvaluationsMap = new Map<
            string,
            {
                currentUserEval: number | null
                allEvals: Array<{
                    divisionId: number
                    divisionLevel: number
                    divisionName: string
                    evaluatorName: string
                }>
            }
        >()

        if (newPlayerIds.length > 0 && currentUserId) {
            const existingEvals = await db
                .select({
                    player: evaluations.player,
                    division: evaluations.division,
                    evaluator: evaluations.evaluator,
                    divisionName: divisions.name,
                    divisionLevel: divisions.level,
                    evaluatorFirstName: users.first_name,
                    evaluatorPreferredName: users.preffered_name
                })
                .from(evaluations)
                .innerJoin(divisions, eq(evaluations.division, divisions.id))
                .innerJoin(users, eq(evaluations.evaluator, users.id))
                .where(
                    and(
                        eq(evaluations.season, config.seasonId),
                        inArray(evaluations.player, newPlayerIds)
                    )
                )

            // Group evaluations by player
            for (const evalRow of existingEvals) {
                if (!playerEvaluationsMap.has(evalRow.player)) {
                    playerEvaluationsMap.set(evalRow.player, {
                        currentUserEval: null,
                        allEvals: []
                    })
                }

                const playerData = playerEvaluationsMap.get(evalRow.player)!

                if (evalRow.evaluator === currentUserId) {
                    playerData.currentUserEval = evalRow.division
                }

                playerData.allEvals.push({
                    divisionId: evalRow.division,
                    divisionLevel: evalRow.divisionLevel,
                    divisionName: evalRow.divisionName,
                    evaluatorName:
                        evalRow.evaluatorPreferredName ||
                        evalRow.evaluatorFirstName
                })
            }
        }

        const entries: NewPlayerEntry[] = newPlayers.map((row) => {
            const evalData = playerEvaluationsMap.get(row.userId) || {
                currentUserEval: null,
                allEvals: []
            }

            const averageEvaluation =
                evalData.allEvals.length > 0
                    ? evalData.allEvals.reduce(
                          (sum, e) => sum + e.divisionLevel,
                          0
                      ) / evalData.allEvals.length
                    : null

            return {
                ...row,
                currentUserEvaluation: evalData.currentUserEval,
                averageEvaluation,
                evaluationCount: evalData.allEvals.length,
                evaluatorDetails: evalData.allEvals
            }
        })

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

        const session = await auth.api.getSession({ headers: await headers() })
        if (!session) {
            return { status: false, message: "Unauthorized - no session" }
        }

        const currentUserId = session.user.id
        const playerIds = data.map((d) => d.playerId)

        // Delete existing evaluations by this user for these players this season
        if (playerIds.length > 0) {
            await db
                .delete(evaluations)
                .where(
                    and(
                        eq(evaluations.season, config.seasonId),
                        inArray(evaluations.player, playerIds),
                        eq(evaluations.evaluator, currentUserId)
                    )
                )
        }

        // Insert new evaluations with evaluator
        if (data.length > 0) {
            await db.insert(evaluations).values(
                data.map((entry) => ({
                    season: config.seasonId,
                    player: entry.playerId,
                    division: entry.division,
                    evaluator: currentUserId
                }))
            )
        }

        await logAuditEntry({
            userId: currentUserId,
            action: "upsert",
            entityType: "evaluations",
            summary: `Saved ${data.length} player evaluations for current season`
        })

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
