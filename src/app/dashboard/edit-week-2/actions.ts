"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    signups,
    users,
    week2Rosters,
    teams,
    divisions,
    individual_divisions,
    drafts,
    seasons
} from "@/database/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { logAuditEntry } from "@/lib/audit-log"
import { fetchPlayerScores } from "@/lib/player-score"

export interface Week2EditablePlayer {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    hasPairPick: boolean
    placementScore: number
    lastDivisionName: string | null
    seasonsPlayedCount: number
}

export interface Week2EditableSlot {
    id: number
    divisionId: number
    divisionName: string
    teamNumber: number
    userId: string
    isCaptain: boolean
}

export interface Week2RosterEntry {
    divisionId: number
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
                    male: users.male,
                    datesMissing: signups.dates_missing,
                    pairPick: signups.pair_pick
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

        const signupPlayers = signupPlayersRaw.filter((player) => {
            if (!tryout2) {
                return true
            }

            const missingDates = (player.datesMissing || "")
                .split(",")
                .map((value) => value.trim().toLowerCase())
                .filter(Boolean)

            return !missingDates.includes(tryout2)
        })

        const userIds = signupPlayers.map((p) => p.id)

        const [draftRows, scoreByUser] = await Promise.all([
            userIds.length > 0
                ? db
                      .select({
                          userId: drafts.user,
                          seasonId: seasons.id,
                          divisionName: divisions.name
                      })
                      .from(drafts)
                      .innerJoin(teams, eq(drafts.team, teams.id))
                      .innerJoin(seasons, eq(teams.season, seasons.id))
                      .innerJoin(divisions, eq(teams.division, divisions.id))
                      .where(inArray(drafts.user, userIds))
                      .orderBy(desc(seasons.id), drafts.overall)
                : Promise.resolve([]),
            userIds.length > 0
                ? fetchPlayerScores(userIds, config.seasonId)
                : Promise.resolve(new Map<string, number>())
        ])

        const lastDivisionByUser = new Map<string, string>()
        const seasonsCountByUser = new Map<string, Set<number>>()
        for (const row of draftRows) {
            if (!lastDivisionByUser.has(row.userId)) {
                lastDivisionByUser.set(row.userId, row.divisionName)
            }
            const seasons = seasonsCountByUser.get(row.userId) || new Set()
            seasons.add(row.seasonId)
            seasonsCountByUser.set(row.userId, seasons)
        }

        return {
            status: true,
            seasonId: config.seasonId,
            seasonLabel,
            players: signupPlayers.map((player) => ({
                id: player.id,
                firstName: player.firstName,
                lastName: player.lastName,
                preferredName: player.preferredName,
                male: player.male,
                hasPairPick: !!player.pairPick,
                placementScore: scoreByUser.get(player.id) ?? 200,
                lastDivisionName: lastDivisionByUser.get(player.id) ?? null,
                seasonsPlayedCount:
                    seasonsCountByUser.get(player.id)?.size ?? 0
            })),
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
    slots: Array<Week2RosterEntry>
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
                    divisionId: teams.division,
                    divisionName: divisions.name,
                    isCoachDiv: individual_divisions.coaches
                })
                .from(teams)
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .leftJoin(
                    individual_divisions,
                    and(
                        eq(individual_divisions.division, teams.division),
                        eq(individual_divisions.season, config.seasonId)
                    )
                )
                .where(eq(teams.season, config.seasonId))
        ])

        if (signedUpRows.length !== uniqueUserIds.size) {
            return {
                status: false,
                message:
                    "All selected players must be signed up for the current season."
            }
        }

        const captainDivisionByUser = new Map<string, number>()
        const divisionNameById = new Map<number, string>()
        for (const row of captainRows) {
            divisionNameById.set(row.divisionId, row.divisionName)
            if (!row.isCoachDiv) {
                captainDivisionByUser.set(row.userId, row.divisionId)
            }
        }

        for (const slot of filledSlots) {
            if (slot.isCaptain) {
                const expectedDivision = captainDivisionByUser.get(slot.userId)
                if (
                    !expectedDivision ||
                    expectedDivision !== slot.divisionId
                ) {
                    const slotDivisionName =
                        divisionNameById.get(slot.divisionId) ??
                        `Division ${slot.divisionId}`
                    return {
                        status: false,
                        message: `Captain slot in ${slotDivisionName} Team ${slot.teamNumber} does not contain a captain assigned to that division.`
                    }
                }
            }
        }
    }

    try {
        await db.transaction(async (tx) => {
            await tx
                .delete(week2Rosters)
                .where(eq(week2Rosters.season, config.seasonId))

            if (filledSlots.length > 0) {
                await tx.insert(week2Rosters).values(
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
                entityType: "week2_rosters",
                summary: `Replaced week 2 rosters for season ${config.seasonId} (${filledSlots.length} slots)`
            })
        }

        return {
            status: true,
            message: "Week 2 rosters saved successfully."
        }
    } catch (error) {
        console.error("Error saving week 2 rosters:", error)
        return {
            status: false,
            message: "Something went wrong while saving week 2 rosters."
        }
    }
}
