"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { signups, users, week1Rosters, drafts, teams, seasons, divisions, evaluations } from "@/database/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { logAuditEntry } from "@/lib/audit-log"

export interface Week1EditablePlayer {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    placementScore: number | null
    playFirstWeek: boolean
    seasonsPlayed: number
}

export interface Week1EditableSlot {
    id: number
    sessionNumber: number
    courtNumber: number
    userId: string
}

export interface Week1RosterEntry {
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

        const [signupPlayersRaw, rosterSlots] = await Promise.all([
            db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preffered_name,
                    male: users.male,
                    playFirstWeek: signups.play_1st_week
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

        const userIds = signupPlayersRaw.map((p) => p.id)

        const draftRows = userIds.length > 0
            ? await db
                .select({
                    userId: drafts.user,
                    seasonId: seasons.id,
                    overall: drafts.overall
                })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .innerJoin(seasons, eq(teams.season, seasons.id))
                .where(inArray(drafts.user, userIds))
                .orderBy(desc(seasons.id))
            : []

        const mostRecentOverallByUser = new Map<string, number>()
        const seasonsPlayedByUser = new Map<string, Set<number>>()
        for (const row of draftRows) {
            if (!mostRecentOverallByUser.has(row.userId)) {
                mostRecentOverallByUser.set(row.userId, row.overall)
            }
            const seasons = seasonsPlayedByUser.get(row.userId) || new Set<number>()
            seasons.add(row.seasonId)
            seasonsPlayedByUser.set(row.userId, seasons)
        }

        const usersWithoutDraft = userIds.filter(
            (id) => !mostRecentOverallByUser.has(id)
        )
        const evalScoreByUser = new Map<string, number>()
        if (usersWithoutDraft.length > 0) {
            const evalRows = await db
                .select({
                    playerId: evaluations.player,
                    divisionLevel: divisions.level
                })
                .from(evaluations)
                .innerJoin(divisions, eq(evaluations.division, divisions.id))
                .where(
                    and(
                        eq(evaluations.season, config.seasonId),
                        inArray(evaluations.player, usersWithoutDraft)
                    )
                )

            const aggregates = new Map<string, { sum: number; count: number }>()
            for (const row of evalRows) {
                const current = aggregates.get(row.playerId) || { sum: 0, count: 0 }
                current.sum += row.divisionLevel
                current.count += 1
                aggregates.set(row.playerId, current)
            }
            for (const [playerId, agg] of aggregates.entries()) {
                evalScoreByUser.set(playerId, (agg.sum / agg.count - 1) * 50)
            }
        }

        const signupPlayers: Week1EditablePlayer[] = signupPlayersRaw.map((p) => ({
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            preferredName: p.preferredName,
            male: p.male,
            playFirstWeek: p.playFirstWeek ?? false,
            seasonsPlayed: seasonsPlayedByUser.get(p.id)?.size ?? 0,
            placementScore: mostRecentOverallByUser.get(p.id)
                ?? evalScoreByUser.get(p.id)
                ?? null
        }))

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
    slots: Array<Week1RosterEntry>
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
    const userIds = filledSlots.map((s) => s.userId)
    const uniqueUserIds = new Set(userIds)

    if (uniqueUserIds.size !== userIds.length) {
        return {
            status: false,
            message: "A player cannot be assigned to multiple week 1 slots."
        }
    }

    if (uniqueUserIds.size > 0) {
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
    }

    try {
        await db.transaction(async (tx) => {
            await tx
                .delete(week1Rosters)
                .where(eq(week1Rosters.season, config.seasonId))

            if (filledSlots.length > 0) {
                await tx.insert(week1Rosters).values(
                    filledSlots.map((slot) => ({
                        season: config.seasonId,
                        user: slot.userId,
                        session_number: slot.sessionNumber,
                        court_number: slot.courtNumber
                    }))
                )
            }
        })

        const session = await auth.api.getSession({ headers: await headers() })
        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "week1_rosters",
                summary: `Replaced week 1 rosters for season ${config.seasonId} (${filledSlots.length} slots)`
            })
        }

        return {
            status: true,
            message: "Week 1 rosters saved successfully."
        }
    } catch (error) {
        console.error("Error saving week 1 rosters:", error)
        return {
            status: false,
            message: "Something went wrong while saving week 1 rosters."
        }
    }
}
