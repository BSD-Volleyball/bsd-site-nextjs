"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail, requirePositiveInt } from "@/next/action-helpers"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { userRoles } from "@/database/schema"
import { eq, and, isNotNull } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"
import { invalidateAllSessionsForUser } from "@/lib/rbac"
import { getDivisions } from "./data"

export interface CommissionerAssignment {
    divisionName: string
    divisionId: number
    commissioner1: string | null
    commissioner2: string | null
}

export const getCommissionersForSeason = withAction(
    async (
        seasonId: number
    ): Promise<ActionResult<CommissionerAssignment[]>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        if (!Number.isInteger(seasonId) || seasonId <= 0) {
            return fail("Invalid season.")
        }

        try {
            // Get the divisions first
            const divisionsResult = await getDivisions()
            if (!divisionsResult.status) {
                return fail(divisionsResult.message)
            }

            // Get all division-scoped commissioners for this season
            const seasonCommissioners = await db
                .select({
                    divisionId: userRoles.division_id,
                    commissionerId: userRoles.user_id
                })
                .from(userRoles)
                .where(
                    and(
                        eq(userRoles.role, "commissioner"),
                        eq(userRoles.season_id, seasonId),
                        isNotNull(userRoles.division_id)
                    )
                )

            // Build assignments for each division
            const assignments: CommissionerAssignment[] =
                divisionsResult.data.map((div) => {
                    const divCommissioners = seasonCommissioners.filter(
                        (c) => c.divisionId === div.id
                    )
                    return {
                        divisionName: div.name,
                        divisionId: div.id,
                        commissioner1:
                            divCommissioners[0]?.commissionerId ?? null,
                        commissioner2:
                            divCommissioners[1]?.commissionerId ?? null
                    }
                })

            return ok(assignments)
        } catch (error) {
            logger.error(
                "Error fetching commissioners for season",
                undefined,
                error
            )
            return fail("Failed to load commissioners.")
        }
    }
)

export const saveCommissioners = withAction(
    async (data: {
        seasonId: number
        assignments: Array<{
            divisionId: number
            divisionName: string
            commissioner1: string | null
            commissioner2: string | null
        }>
    }): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        requirePositiveInt(data.seasonId, "season ID")

        try {
            const scopedRows = and(
                eq(userRoles.role, "commissioner"),
                eq(userRoles.season_id, data.seasonId),
                isNotNull(userRoles.division_id)
            )
            const before = await db
                .select({ userId: userRoles.user_id })
                .from(userRoles)
                .where(scopedRows)
            const previousHolders = new Set(before.map((r) => r.userId))

            // Replace this season's division-scoped commissioner roles.
            // League-wide commissioner rows (division_id IS NULL) are managed via
            // /dashboard/manage-roles and deliberately left untouched here.
            await db
                .delete(userRoles)
                .where(
                    and(
                        eq(userRoles.role, "commissioner"),
                        eq(userRoles.season_id, data.seasonId),
                        isNotNull(userRoles.division_id)
                    )
                )

            const userRoleValues: Array<{
                user_id: string
                role: string
                season_id: number
                division_id: number
            }> = []

            for (const assignment of data.assignments) {
                if (assignment.commissioner1) {
                    userRoleValues.push({
                        user_id: assignment.commissioner1,
                        role: "commissioner",
                        season_id: data.seasonId,
                        division_id: assignment.divisionId
                    })
                }
                if (assignment.commissioner2) {
                    userRoleValues.push({
                        user_id: assignment.commissioner2,
                        role: "commissioner",
                        season_id: data.seasonId,
                        division_id: assignment.divisionId
                    })
                }
            }

            if (userRoleValues.length > 0) {
                await db.insert(userRoles).values(userRoleValues)
            }

            // Anyone who lost the role should not keep a session that was
            // opened with it (permission checks read user_roles live, so
            // this closes the cookie-cache window rather than a real hole).
            const currentHolders = new Set(userRoleValues.map((r) => r.user_id))
            const removed = [...previousHolders].filter(
                (id) => !currentHolders.has(id)
            )
            const added = [...currentHolders].filter(
                (id) => !previousHolders.has(id)
            )
            for (const userId of removed) {
                await invalidateAllSessionsForUser(userId)
            }

            // Log the action, naming who gained and lost the role
            const sessionUserId = await getSessionUserId()
            if (sessionUserId) {
                const detail = [
                    added.length ? `added ${added.join(", ")}` : null,
                    removed.length ? `removed ${removed.join(", ")}` : null
                ]
                    .filter(Boolean)
                    .join("; ")
                await logAuditEntry({
                    userId: sessionUserId,
                    action: "update",
                    entityType: "commissioners",
                    summary: `Updated commissioners for season ${data.seasonId}${detail ? ` (${detail})` : ""}`
                })
            }

            revalidatePath("/dashboard/select-commissioners")
            return ok(undefined, "Commissioners updated successfully.")
        } catch (error) {
            logger.error("Error saving commissioners", undefined, error)
            return fail("Failed to save commissioners.")
        }
    }
)
