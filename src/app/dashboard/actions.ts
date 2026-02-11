"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { checkSignupEligibility } from "@/lib/site-config"
import { db } from "@/database/db"
import {
    users,
    waitlist,
    seasons,
    teams,
    drafts,
    divisions
} from "@/database/schema"
import { eq, and, lte, desc, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"

export async function getSignupEligibility(): Promise<boolean> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return false
    }

    return checkSignupEligibility(session.user.id)
}

export async function getIsAdminOrDirector(): Promise<boolean> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return false
    }

    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)

    return user?.role === "admin" || user?.role === "director"
}

export interface SeasonNavDivision {
    id: number
    name: string
    level: number
}

export interface SeasonNavItem {
    id: number
    year: number
    season: string
    divisions: SeasonNavDivision[]
}

export async function getRecentSeasonsNav(): Promise<SeasonNavItem[]> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return []
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return []
        }

        const recentSeasons = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
            .where(lte(seasons.id, config.seasonId))
            .orderBy(desc(seasons.id))
            .limit(4)

        if (recentSeasons.length === 0) {
            return []
        }

        const seasonIds = recentSeasons.map((s) => s.id)

        const divisionsWithDrafts = await db
            .selectDistinct({
                seasonId: teams.season,
                divisionId: divisions.id,
                divisionName: divisions.name,
                divisionLevel: divisions.level
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(inArray(teams.season, seasonIds))
            .orderBy(divisions.level)

        const divisionsBySeasonId = new Map<number, SeasonNavDivision[]>()
        for (const row of divisionsWithDrafts) {
            const arr = divisionsBySeasonId.get(row.seasonId) || []
            arr.push({
                id: row.divisionId,
                name: row.divisionName,
                level: row.divisionLevel
            })
            divisionsBySeasonId.set(row.seasonId, arr)
        }

        return recentSeasons
            .filter((s) => divisionsBySeasonId.has(s.id))
            .map((s) => ({
                id: s.id,
                year: s.year,
                season: s.season,
                divisions: divisionsBySeasonId.get(s.id) || []
            }))
    } catch (error) {
        console.error("Error fetching recent seasons nav:", error)
        return []
    }
}

export interface TeamRosterPlayer {
    id: string
    displayName: string
    lastName: string
    isCaptain: boolean
}

export interface TeamRosterData {
    status: boolean
    message?: string
    teamName: string
    players: TeamRosterPlayer[]
}

export async function getTeamRoster(
    teamId: number
): Promise<TeamRosterData> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return { status: false, message: "Not authenticated.", teamName: "", players: [] }
    }

    try {
        const [team] = await db
            .select({
                id: teams.id,
                name: teams.name,
                captain: teams.captain
            })
            .from(teams)
            .where(eq(teams.id, teamId))
            .limit(1)

        if (!team) {
            return { status: false, message: "Team not found.", teamName: "", players: [] }
        }

        const draftRows = await db
            .select({
                userId: drafts.user,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name
            })
            .from(drafts)
            .innerJoin(users, eq(drafts.user, users.id))
            .where(eq(drafts.team, teamId))

        const players: TeamRosterPlayer[] = draftRows.map((row) => ({
            id: row.userId,
            displayName: row.preferredName || row.firstName,
            lastName: row.lastName,
            isCaptain: row.userId === team.captain
        }))

        players.sort((a, b) => {
            const lastCmp = a.lastName.toLowerCase().localeCompare(b.lastName.toLowerCase())
            if (lastCmp !== 0) return lastCmp
            return a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase())
        })

        return {
            status: true,
            teamName: team.name,
            players
        }
    } catch (error) {
        console.error("Error fetching team roster:", error)
        return { status: false, message: "Something went wrong.", teamName: "", players: [] }
    }
}

export async function expressWaitlistInterest(
    seasonId: number
): Promise<{ status: boolean; message: string }> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return { status: false, message: "Not authenticated." }
    }

    try {
        // Check if user is already on the waitlist for this season
        const [existing] = await db
            .select({ id: waitlist.id })
            .from(waitlist)
            .where(
                and(
                    eq(waitlist.season, seasonId),
                    eq(waitlist.user, session.user.id)
                )
            )
            .limit(1)

        if (existing) {
            return {
                status: false,
                message: "You've already expressed interest for this season."
            }
        }

        await db.insert(waitlist).values({
            season: seasonId,
            user: session.user.id,
            created_at: new Date()
        })

        await logAuditEntry({
            userId: session.user.id,
            action: "create",
            entityType: "waitlist",
            summary: `Expressed waitlist interest for season ${seasonId}`
        })

        return {
            status: true,
            message:
                "Your interest has been recorded. We'll reach out if a spot opens up!"
        }
    } catch (error) {
        console.error("Failed to express waitlist interest:", error)
        return {
            status: false,
            message: "Something went wrong. Please try again."
        }
    }
}
