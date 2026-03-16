"use server"

import { db } from "@/database/db"
import { users, teams, divisions } from "@/database/schema"
import { eq, and, sql, inArray } from "drizzle-orm"
import { getIsCommissioner } from "@/app/dashboard/actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getSeasonConfig } from "@/lib/site-config"
import { getCommissionerDivisionAccess } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"

export interface CaptainRow {
    teamId: number
    teamName: string
    teamNumber: number | null
    captainId: string
    captainName: string
}

export interface DivisionData {
    divisionId: number
    divisionName: string
    captains: CaptainRow[]
}

export interface DraftDayData {
    status: boolean
    message?: string
    seasonLabel: string
    divisions: DivisionData[]
    commissionerDivisionId: number | null
}

export async function getDraftDayData(
    divisionId?: number
): Promise<DraftDayData> {
    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            seasonLabel: "",
            divisions: [],
            commissionerDivisionId: null
        }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return {
                status: false,
                message: "No active season found.",
                seasonLabel: "",
                divisions: [],
                commissionerDivisionId: null
            }
        }

        const seasonId = config.seasonId
        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user) {
            return {
                status: false,
                message: "Unauthorized",
                seasonLabel: "",
                divisions: [],
                commissionerDivisionId: null
            }
        }

        const divisionAccess = await getCommissionerDivisionAccess(
            session.user.id,
            seasonId
        )

        if (divisionAccess.type === "denied") {
            return {
                status: false,
                message: "Unauthorized",
                seasonLabel: "",
                divisions: [],
                commissionerDivisionId: null
            }
        }

        const commissionerDivisionId =
            divisionAccess.type === "division_specific"
                ? divisionAccess.divisionId
                : null

        // Determine which division to filter by
        const targetDivisionId =
            divisionAccess.type === "division_specific"
                ? divisionAccess.divisionId
                : divisionId

        const rows = await db
            .select({
                teamId: teams.id,
                teamName: teams.name,
                teamNumber: teams.number,
                captainId: teams.captain,
                divisionId: divisions.id,
                divisionName: divisions.name,
                divisionLevel: divisions.level,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name
            })
            .from(teams)
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .innerJoin(users, eq(teams.captain, users.id))
            .where(
                and(
                    eq(teams.season, seasonId),
                    targetDivisionId !== undefined
                        ? eq(teams.division, targetDivisionId)
                        : undefined
                )
            )
            .orderBy(divisions.level, sql`${teams.number} asc nulls last`)

        // Group by division
        const divisionMap = new Map<
            number,
            {
                divisionName: string
                divisionLevel: number
                captains: CaptainRow[]
            }
        >()

        for (const row of rows) {
            const existing = divisionMap.get(row.divisionId)
            const captainName =
                `${row.preferredName || row.firstName} ${row.lastName}`.trim()
            const captainRow: CaptainRow = {
                teamId: row.teamId,
                teamName: row.teamName,
                teamNumber: row.teamNumber,
                captainId: row.captainId,
                captainName
            }
            if (!existing) {
                divisionMap.set(row.divisionId, {
                    divisionName: row.divisionName,
                    divisionLevel: row.divisionLevel,
                    captains: [captainRow]
                })
            } else {
                existing.captains.push(captainRow)
            }
        }

        const divisionList: DivisionData[] = [...divisionMap.entries()]
            .sort((a, b) => a[1].divisionLevel - b[1].divisionLevel)
            .map(([divId, div]) => ({
                divisionId: divId,
                divisionName: div.divisionName,
                captains: div.captains
            }))

        return {
            status: true,
            seasonLabel,
            divisions: divisionList,
            commissionerDivisionId
        }
    } catch (error) {
        console.error("Error fetching draft day data:", error)
        return {
            status: false,
            message: "Something went wrong.",
            seasonLabel: "",
            divisions: [],
            commissionerDivisionId: null
        }
    }
}

export async function saveDraftOrder(
    assignments: { teamId: number; number: number }[]
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return { status: false, message: "No active season found." }
        }

        const seasonId = config.seasonId

        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user) {
            return { status: false, message: "Unauthorized" }
        }

        const divisionAccess = await getCommissionerDivisionAccess(
            session.user.id,
            seasonId
        )

        if (divisionAccess.type === "denied") {
            return { status: false, message: "Unauthorized" }
        }

        // Security: validate all teamIds belong to accessible divisions for this season
        const teamIds = assignments.map((a) => a.teamId)

        const validTeams = await db
            .select({ id: teams.id })
            .from(teams)
            .where(
                and(
                    eq(teams.season, seasonId),
                    inArray(teams.id, teamIds),
                    divisionAccess.type === "division_specific"
                        ? eq(teams.division, divisionAccess.divisionId)
                        : undefined
                )
            )

        const validTeamIds = new Set(validTeams.map((t) => t.id))

        for (const assignment of assignments) {
            if (!validTeamIds.has(assignment.teamId)) {
                return {
                    status: false,
                    message: "One or more teams are not accessible."
                }
            }
        }

        // Update each team's draft number
        for (const assignment of assignments) {
            await db
                .update(teams)
                .set({ number: assignment.number })
                .where(eq(teams.id, assignment.teamId))
        }

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "teams",
            summary: `Saved draft order for ${assignments.length} teams in season ${seasonId}`
        })

        return { status: true, message: "Draft order saved successfully." }
    } catch (error) {
        console.error("Error saving draft order:", error)
        return { status: false, message: "Something went wrong." }
    }
}
