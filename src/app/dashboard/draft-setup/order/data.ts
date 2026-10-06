import "server-only"

import { formatSeasonLabel } from "@/lib/season-utils"
import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { db } from "@/database/db"
import { users, teams, divisions } from "@/database/schema"
import { eq, and, sql, inArray } from "drizzle-orm"
import { getSessionUserId, isCommissionerBySession } from "@/next/session"
import { getSeasonConfig } from "@/lib/site-config"
import { getCommissionerDivisionScope } from "@/lib/rbac"
import { isGhostCaptain, getGhostDisplayName } from "@/lib/ghost-captain"
import { formatDisplayName } from "@/lib/utils"

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
    seasonLabel: string
    divisions: DivisionData[]
    commissionerDivisionId: number | null
}

export const getDraftDayData = withAction(
    async (divisionId?: number): Promise<ActionResult<DraftDayData>> => {
        const hasAccess = await isCommissionerBySession()

        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const config = await getSeasonConfig()

            if (!config.seasonId) {
                return fail("No active season found.")
            }

            const seasonId = config.seasonId
            const seasonLabel = formatSeasonLabel(config)

            const userId = await getSessionUserId()
            if (!userId) {
                return fail("Unauthorized")
            }

            const divisionAccess = await getCommissionerDivisionScope(
                userId,
                seasonId
            )

            if (divisionAccess.type === "denied") {
                return fail("Unauthorized")
            }

            const commissionerDivisionId =
                divisionAccess.type === "division_specific" &&
                divisionAccess.divisionIds.length === 1
                    ? divisionAccess.divisionIds[0]
                    : null
            const allowedDivisionIds =
                divisionAccess.type === "division_specific"
                    ? divisionAccess.divisionIds
                    : null
            const targetDivisionId =
                divisionId !== undefined &&
                (allowedDivisionIds === null ||
                    allowedDivisionIds.includes(divisionId))
                    ? divisionId
                    : undefined

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
                    preferredName: users.preferred_name
                })
                .from(teams)
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .innerJoin(users, eq(teams.captain, users.id))
                .where(
                    and(
                        eq(teams.season, seasonId),
                        allowedDivisionIds !== null
                            ? inArray(teams.division, allowedDivisionIds)
                            : undefined,
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
                const captainName = formatDisplayName(
                    row.firstName,
                    row.lastName,
                    row.preferredName
                )
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

            // Assign ghost display names per-division (Ghost vs Ghost 1/Ghost 2)
            for (const div of divisionMap.values()) {
                const ghostIndices = div.captains
                    .map((c, i) => (isGhostCaptain(c.captainId) ? i : -1))
                    .filter((i) => i !== -1)
                const totalGhosts = ghostIndices.length
                ghostIndices.forEach((idx, ghostIdx) => {
                    div.captains[idx].captainName = getGhostDisplayName(
                        ghostIdx,
                        totalGhosts
                    )
                })
            }

            const divisionList: DivisionData[] = [...divisionMap.entries()]
                .sort((a, b) => a[1].divisionLevel - b[1].divisionLevel)
                .map(([divId, div]) => ({
                    divisionId: divId,
                    divisionName: div.divisionName,
                    captains: div.captains
                }))

            return ok({
                seasonLabel,
                divisions: divisionList,
                commissionerDivisionId
            })
        } catch (error) {
            logger.error("Error fetching draft day data", undefined, error)
            return fail("Something went wrong.")
        }
    }
)
