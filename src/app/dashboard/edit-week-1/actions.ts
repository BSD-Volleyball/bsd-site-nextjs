"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { signups, users, week1Rosters } from "@/database/schema"
import { and, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { logAuditEntry } from "@/lib/audit-log"

export interface Week1EditablePlayer {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
}

export interface Week1EditableSlot {
    id: number
    sessionNumber: number
    courtNumber: number
    userId: string
}

export async function getEditWeek1Data(): Promise<{
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    players: Week1EditablePlayer[]
    slots: Week1EditableSlot[]
}> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            seasonId: 0,
            seasonLabel: "",
            players: [],
            slots: []
        }
    }

    try {
        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                seasonId: 0,
                seasonLabel: "",
                players: [],
                slots: []
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        const [signupPlayers, rosterSlots] = await Promise.all([
            db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preffered_name
                })
                .from(signups)
                .innerJoin(users, eq(signups.player, users.id))
                .where(eq(signups.season, config.seasonId))
                .orderBy(users.last_name, users.first_name),
            db
                .select({
                    id: week1Rosters.id,
                    sessionNumber: week1Rosters.session_number,
                    courtNumber: week1Rosters.court_number,
                    userId: week1Rosters.user
                })
                .from(week1Rosters)
                .where(eq(week1Rosters.season, config.seasonId))
                .orderBy(
                    week1Rosters.session_number,
                    week1Rosters.court_number,
                    week1Rosters.id
                )
        ])

        return {
            status: true,
            seasonId: config.seasonId,
            seasonLabel,
            players: signupPlayers,
            slots: rosterSlots
        }
    } catch (error) {
        console.error("Error loading edit week 1 data:", error)
        return {
            status: false,
            message: "Something went wrong while loading data.",
            seasonId: 0,
            seasonLabel: "",
            players: [],
            slots: []
        }
    }
}

export async function updateWeek1Rosters(
    updates: Array<{ id: number; userId: string }>
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to perform this action."
        }
    }

    if (updates.length === 0) {
        return {
            status: false,
            message: "No updates provided."
        }
    }

    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return {
            status: false,
            message: "No current season found."
        }
    }

    const userIds = updates.map((item) => item.userId)
    const uniqueUserIds = new Set(userIds)

    if (uniqueUserIds.size !== userIds.length) {
        return {
            status: false,
            message: "A player cannot be assigned to multiple week 1 slots."
        }
    }

    const signedUpRows = await db
        .select({ playerId: signups.player })
        .from(signups)
        .where(
            and(
                eq(signups.season, config.seasonId),
                inArray(signups.player, [...uniqueUserIds])
            )
        )

    if (signedUpRows.length !== uniqueUserIds.size) {
        return {
            status: false,
            message:
                "All selected players must be signed up for the current season."
        }
    }

    try {
        await db.transaction(async (tx) => {
            for (const update of updates) {
                await tx
                    .update(week1Rosters)
                    .set({ user: update.userId })
                    .where(
                        and(
                            eq(week1Rosters.id, update.id),
                            eq(week1Rosters.season, config.seasonId)
                        )
                    )
            }
        })

        const session = await auth.api.getSession({ headers: await headers() })
        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "week1_rosters",
                summary: `Updated week 1 rosters for season ${config.seasonId}`
            })
        }

        return {
            status: true,
            message: "Week 1 rosters updated successfully."
        }
    } catch (error) {
        console.error("Error updating week 1 rosters:", error)
        return {
            status: false,
            message: "Something went wrong while updating week 1 rosters."
        }
    }
}
