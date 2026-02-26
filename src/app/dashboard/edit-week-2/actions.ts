"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    signups,
    users,
    week2Rosters,
    teams,
    divisions
} from "@/database/schema"
import { and, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { logAuditEntry } from "@/lib/audit-log"

export interface Week2EditablePlayer {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
}

export interface Week2EditableSlot {
    id: number
    divisionId: number
    divisionName: string
    teamNumber: number
    userId: string
    isCaptain: boolean
}

export async function getEditWeek2Data(): Promise<{
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    players: Week2EditablePlayer[]
    slots: Week2EditableSlot[]
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
        const tryout2 = config.tryout2Date.trim().toLowerCase()

        const [signupPlayersRaw, rosterSlots] = await Promise.all([
            db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preffered_name,
                    datesMissing: signups.dates_missing
                })
                .from(signups)
                .innerJoin(users, eq(signups.player, users.id))
                .where(eq(signups.season, config.seasonId))
                .orderBy(users.last_name, users.first_name),
            db
                .select({
                    id: week2Rosters.id,
                    divisionId: week2Rosters.division,
                    divisionName: divisions.name,
                    teamNumber: week2Rosters.team_number,
                    userId: week2Rosters.user,
                    isCaptain: week2Rosters.is_captain
                })
                .from(week2Rosters)
                .innerJoin(divisions, eq(week2Rosters.division, divisions.id))
                .where(eq(week2Rosters.season, config.seasonId))
                .orderBy(
                    divisions.level,
                    week2Rosters.team_number,
                    week2Rosters.id
                )
        ])

        const signupPlayers = signupPlayersRaw
            .filter((player) => {
                if (!tryout2) {
                    return true
                }

                const missingDates = (player.datesMissing || "")
                    .split(",")
                    .map((value) => value.trim().toLowerCase())
                    .filter(Boolean)

                return !missingDates.includes(tryout2)
            })
            .map((player) => ({
                id: player.id,
                firstName: player.firstName,
                lastName: player.lastName,
                preferredName: player.preferredName
            }))

        return {
            status: true,
            seasonId: config.seasonId,
            seasonLabel,
            players: signupPlayers,
            slots: rosterSlots
        }
    } catch (error) {
        console.error("Error loading edit week 2 data:", error)
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

export async function updateWeek2Rosters(
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
            message: "A player cannot be assigned to multiple week 2 slots."
        }
    }

    const [signedUpRows, existingSlots, captainRows] = await Promise.all([
        db
            .select({ playerId: signups.player })
            .from(signups)
            .where(
                and(
                    eq(signups.season, config.seasonId),
                    inArray(signups.player, [...uniqueUserIds])
                )
            ),
        db
            .select({
                id: week2Rosters.id,
                divisionId: week2Rosters.division,
                isCaptain: week2Rosters.is_captain
            })
            .from(week2Rosters)
            .where(eq(week2Rosters.season, config.seasonId)),
        db
            .select({
                userId: teams.captain,
                divisionId: teams.division
            })
            .from(teams)
            .where(eq(teams.season, config.seasonId))
    ])

    if (signedUpRows.length !== uniqueUserIds.size) {
        return {
            status: false,
            message:
                "All selected players must be signed up for the current season."
        }
    }

    const slotById = new Map(existingSlots.map((slot) => [slot.id, slot]))
    const captainDivisionByUser = new Map(
        captainRows.map((row) => [row.userId, row.divisionId])
    )

    for (const update of updates) {
        const slot = slotById.get(update.id)
        if (!slot) {
            return {
                status: false,
                message: "One or more roster slots are invalid."
            }
        }

        if (slot.isCaptain) {
            const expectedDivision = captainDivisionByUser.get(update.userId)
            if (!expectedDivision || expectedDivision !== slot.divisionId) {
                return {
                    status: false,
                    message:
                        "Captain slots must contain captains assigned to that same division."
                }
            }
        }
    }

    try {
        await db.transaction(async (tx) => {
            for (const update of updates) {
                await tx
                    .update(week2Rosters)
                    .set({ user: update.userId })
                    .where(
                        and(
                            eq(week2Rosters.id, update.id),
                            eq(week2Rosters.season, config.seasonId)
                        )
                    )
            }
        })

        const session = await auth.api.getSession({ headers: await headers() })
        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "week2_rosters",
                summary: `Updated week 2 rosters for season ${config.seasonId}`
            })
        }

        return {
            status: true,
            message: "Week 2 rosters updated successfully."
        }
    } catch (error) {
        console.error("Error updating week 2 rosters:", error)
        return {
            status: false,
            message: "Something went wrong while updating week 2 rosters."
        }
    }
}
