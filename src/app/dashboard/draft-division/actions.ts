"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    divisions,
    individual_divisions,
    teams,
    drafts
} from "@/database/schema"
import { eq, and } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { getSeasonConfig } from "@/lib/site-config"
import {
    isAdminOrDirector,
    isCommissionerBySession,
    isCommissionerForCurrentSeason,
    isCaptainForSeason
} from "@/lib/rbac"

export interface DivisionSplitConfig {
    divisionId: number
    genderSplit: string
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

async function checkCommissionersAccess(): Promise<boolean> {
    return isCommissionerBySession()
}

async function checkDraftReadAccess(): Promise<boolean> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return false

    const userId = session.user.id
    const isAdmin = await isAdminOrDirector(userId)
    if (isAdmin) return true

    const config = await getSeasonConfig()
    if (!config.seasonId) return false

    const [isCommissioner, isCaptain] = await Promise.all([
        isCommissionerForCurrentSeason(userId),
        isCaptainForSeason(userId, config.seasonId)
    ])

    return isCommissioner || isCaptain
}

export async function hasDraftPageAccess(): Promise<{
    hasAccess: boolean
    role: "commissioner" | "captain" | null
    captainTeamIds: number[]
    captainDivisionId: number | null
}> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return {
            hasAccess: false,
            role: null,
            captainTeamIds: [],
            captainDivisionId: null
        }
    }

    const userId = session.user.id
    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return {
            hasAccess: false,
            role: null,
            captainTeamIds: [],
            captainDivisionId: null
        }
    }

    const seasonId = config.seasonId

    const isAdmin = await isAdminOrDirector(userId)
    if (isAdmin) {
        return {
            hasAccess: true,
            role: "commissioner",
            captainTeamIds: [],
            captainDivisionId: null
        }
    }

    const [isCommissioner, captainTeams] = await Promise.all([
        isCommissionerForCurrentSeason(userId),
        db
            .select({ id: teams.id, division: teams.division })
            .from(teams)
            .where(and(eq(teams.season, seasonId), eq(teams.captain, userId)))
    ])

    if (isCommissioner) {
        return {
            hasAccess: true,
            role: "commissioner",
            captainTeamIds: [],
            captainDivisionId: null
        }
    }

    if (captainTeams.length > 0) {
        return {
            hasAccess: true,
            role: "captain",
            captainTeamIds: captainTeams.map((t) => t.id),
            captainDivisionId: captainTeams[0].division
        }
    }

    return {
        hasAccess: false,
        role: null,
        captainTeamIds: [],
        captainDivisionId: null
    }
}

export async function getDraftDivisionData(): Promise<{
    status: boolean
    message?: string
    currentSeasonId: number
    divisionSplits: DivisionSplitConfig[]
    divisions: DivisionOption[]
    users: UserOption[]
}> {
    const hasAccess = await checkDraftReadAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            currentSeasonId: 0,
            divisionSplits: [],
            divisions: [],
            users: []
        }
    }

    try {
        const config = await getSeasonConfig()
        const seasonId = config.seasonId || 0

        const [allDivisions, allUsers, splitRows] = await Promise.all([
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
                .orderBy(users.last_name, users.first_name),
            seasonId > 0
                ? db
                      .select({
                          divisionId: individual_divisions.division,
                          genderSplit: individual_divisions.gender_split
                      })
                      .from(individual_divisions)
                      .where(eq(individual_divisions.season, seasonId))
                : Promise.resolve([])
        ])

        const configuredDivisionIds = new Set(
            splitRows
                .filter((r) => r.divisionId !== null)
                .map((r) => r.divisionId as number)
        )

        return {
            status: true,
            currentSeasonId: seasonId,
            divisionSplits: splitRows
                .filter((r) => r.divisionId !== null)
                .map((r) => ({
                    divisionId: r.divisionId as number,
                    genderSplit: r.genderSplit ?? "5-3"
                })),
            divisions: allDivisions.filter((d) =>
                configuredDivisionIds.has(d.id)
            ),
            users: allUsers
        }
    } catch (error) {
        console.error("Error fetching draft division data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            currentSeasonId: 0,
            divisionSplits: [],
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
    const hasAccess = await checkDraftReadAccess()
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
    const hasAccess = await checkCommissionersAccess()
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
