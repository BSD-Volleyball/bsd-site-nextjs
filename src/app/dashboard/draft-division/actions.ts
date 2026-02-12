"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users, seasons, divisions, teams, drafts } from "@/database/schema"
import { eq, desc, and } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"

export interface SeasonOption {
    id: number
    code: string
    year: number
    season: string
}

export interface DivisionOption {
    id: number
    name: string
    level: number
}

export interface TeamOption {
    id: number
    name: string
    number: number | null
}

export interface UserOption {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preffered_name: string | null
    male: boolean | null
    picture: string | null
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

export async function getDraftDivisionData(): Promise<{
    status: boolean
    message?: string
    seasons: SeasonOption[]
    divisions: DivisionOption[]
    users: UserOption[]
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            seasons: [],
            divisions: [],
            users: []
        }
    }

    try {
        const [allSeasons, allDivisions, allUsers] = await Promise.all([
            db
                .select({
                    id: seasons.id,
                    code: seasons.code,
                    year: seasons.year,
                    season: seasons.season
                })
                .from(seasons)
                .orderBy(desc(seasons.year), desc(seasons.id)),
            db
                .select({
                    id: divisions.id,
                    name: divisions.name,
                    level: divisions.level
                })
                .from(divisions)
                .orderBy(divisions.level),
            db
                .select({
                    id: users.id,
                    old_id: users.old_id,
                    first_name: users.first_name,
                    last_name: users.last_name,
                    preffered_name: users.preffered_name,
                    male: users.male,
                    picture: users.picture
                })
                .from(users)
                .orderBy(users.last_name, users.first_name)
        ])

        return {
            status: true,
            seasons: allSeasons,
            divisions: allDivisions,
            users: allUsers
        }
    } catch (error) {
        console.error("Error fetching draft division data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasons: [],
            divisions: [],
            users: []
        }
    }
}

export async function getTeamsForSeasonAndDivision(
    seasonId: number,
    divisionId: number
): Promise<{
    status: boolean
    message?: string
    teams: TeamOption[]
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            teams: []
        }
    }

    try {
        const teamsList = await db
            .select({
                id: teams.id,
                name: teams.name,
                number: teams.number
            })
            .from(teams)
            .where(
                and(eq(teams.season, seasonId), eq(teams.division, divisionId))
            )
            .orderBy(teams.number)

        return {
            status: true,
            teams: teamsList
        }
    } catch (error) {
        console.error("Error fetching teams:", error)
        return {
            status: false,
            message: "Something went wrong.",
            teams: []
        }
    }
}

interface DraftPick {
    teamId: number
    teamNumber: number
    userId: string
    round: number
}

export async function submitDraft(
    divisionLevel: number,
    picks: DraftPick[]
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to perform this action."
        }
    }

    if (picks.length === 0) {
        return {
            status: false,
            message: "No draft picks to submit."
        }
    }

    // Validate all picks have users selected
    for (const pick of picks) {
        if (!pick.userId) {
            return {
                status: false,
                message: `Please select a player for Round ${pick.round}, Team ${pick.teamNumber}.`
            }
        }
    }

    const numTeams = new Set(picks.map((p) => p.teamId)).size

    try {
        // Calculate overall for each pick and insert
        // Snake draft: odd rounds go 1-N, even rounds go N-1
        await db.insert(drafts).values(
            picks.map((pick) => {
                const isOddRound = pick.round % 2 === 1
                const baseValue =
                    (divisionLevel - 1) * 50 + (pick.round - 1) * numTeams
                const positionValue = isOddRound
                    ? pick.teamNumber
                    : numTeams + 1 - pick.teamNumber
                return {
                    team: pick.teamId,
                    user: pick.userId,
                    round: pick.round,
                    overall: baseValue + positionValue
                }
            })
        )

        const session = await auth.api.getSession({ headers: await headers() })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "drafts",
                summary: `Submitted ${picks.length} draft picks for division level ${divisionLevel}`
            })
        }

        return {
            status: true,
            message: `Successfully submitted ${picks.length} draft picks!`
        }
    } catch (error) {
        console.error("Error submitting draft:", error)
        return {
            status: false,
            message: "Something went wrong while submitting the draft."
        }
    }
}
