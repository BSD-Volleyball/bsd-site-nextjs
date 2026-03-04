"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    signups,
    users,
    week3Rosters,
    teams,
    divisions
} from "@/database/schema"
import { and, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { logAuditEntry } from "@/lib/audit-log"

export interface Week3EditablePlayer {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
}

export interface Week3EditableSlot {
    id: number
    divisionId: number
    divisionName: string
    teamNumber: number
    userId: string
    isCaptain: boolean
}

export interface Week3RosterEntry {
    divisionId: number
    teamNumber: number
    userId: string
    isCaptain: boolean
}

export async function getEditWeek3Data(): Promise<{
    status: boolean
    message?: string
    seasonId: number
    seasonLabel: string
    players: Week3EditablePlayer[]
    slots: Week3EditableSlot[]
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
        const tryout3 = config.tryout3Date.trim().toLowerCase()

        const [signupPlayersRaw, rosterSlots] = await Promise.all([
            db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preffered_name,
                    male: users.male,
                    datesMissing: signups.dates_missing
                })
                .from(signups)
                .innerJoin(users, eq(signups.player, users.id))
                .where(eq(signups.season, config.seasonId))
                .orderBy(users.last_name, users.first_name),
            db
                .select({
                    id: week3Rosters.id,
                    divisionId: week3Rosters.division,
                    divisionName: divisions.name,
                    teamNumber: week3Rosters.team_number,
                    userId: week3Rosters.user,
                    isCaptain: week3Rosters.is_captain
                })
                .from(week3Rosters)
                .innerJoin(divisions, eq(week3Rosters.division, divisions.id))
                .where(eq(week3Rosters.season, config.seasonId))
                .orderBy(
                    divisions.level,
                    week3Rosters.team_number,
                    week3Rosters.id
                )
        ])

        const signupPlayers = signupPlayersRaw
            .filter((player) => {
                if (!tryout3) {
                    return true
                }

                const missingDates = (player.datesMissing || "")
                    .split(",")
                    .map((value) => value.trim().toLowerCase())
                    .filter(Boolean)

                return !missingDates.includes(tryout3)
            })
            .map((player) => ({
                id: player.id,
                firstName: player.firstName,
                lastName: player.lastName,
                preferredName: player.preferredName,
                male: player.male
            }))

        return {
            status: true,
            seasonId: config.seasonId,
            seasonLabel,
            players: signupPlayers,
            slots: rosterSlots
        }
    } catch (error) {
        console.error("Error loading edit week 3 data:", error)
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

export async function updateWeek3Rosters(
    slots: Array<Week3RosterEntry>
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to perform this action."
        }
    }

    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return {
            status: false,
            message: "No current season found."
        }
    }

    const filledSlots = slots.filter((s) => s.userId)
    const uniqueUserIds = new Set(filledSlots.map((s) => s.userId))

    if (uniqueUserIds.size > 0) {
        const [signedUpRows, captainRows] = await Promise.all([
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

        const captainDivisionByUser = new Map(
            captainRows.map((row) => [row.userId, row.divisionId])
        )

        for (const slot of filledSlots) {
            if (slot.isCaptain) {
                const expectedDivision = captainDivisionByUser.get(slot.userId)
                if (
                    !expectedDivision ||
                    expectedDivision !== slot.divisionId
                ) {
                    return {
                        status: false,
                        message:
                            "Captain slots must contain captains assigned to that same division."
                    }
                }
            }
        }
    }

    try {
        await db.transaction(async (tx) => {
            await tx
                .delete(week3Rosters)
                .where(eq(week3Rosters.season, config.seasonId))

            if (filledSlots.length > 0) {
                await tx.insert(week3Rosters).values(
                    filledSlots.map((slot) => ({
                        season: config.seasonId,
                        user: slot.userId,
                        division: slot.divisionId,
                        team_number: slot.teamNumber,
                        is_captain: slot.isCaptain
                    }))
                )
            }
        })

        const session = await auth.api.getSession({ headers: await headers() })
        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "week3_rosters",
                summary: `Replaced week 3 rosters for season ${config.seasonId} (${filledSlots.length} slots)`
            })
        }

        return {
            status: true,
            message: "Week 3 rosters saved successfully."
        }
    } catch (error) {
        console.error("Error saving week 3 rosters:", error)
        return {
            status: false,
            message: "Something went wrong while saving week 3 rosters."
        }
    }
}
