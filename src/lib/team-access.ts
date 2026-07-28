import "server-only"

import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import { teams } from "@/database/schema"
import { getCommissionerDivisionScope, isAdminOrDirector } from "@/lib/rbac"

/**
 * May this user manage the given team? True for the team's captain/captain2,
 * admins/directors, and commissioners whose scope covers the team's division.
 * Extracted from team-availability/find-sub-actions.ts so non-action modules
 * (sub requests) can share it.
 */
export async function canAccessTeam(
    userId: string,
    teamId: number,
    seasonId: number
): Promise<boolean> {
    if (await isAdminOrDirector(userId)) return true

    const [teamRow] = await db
        .select({
            captain: teams.captain,
            captain2: teams.captain2,
            division: teams.division
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1)

    if (!teamRow) return false
    if (teamRow.captain === userId || teamRow.captain2 === userId) return true

    const scope = await getCommissionerDivisionScope(userId, seasonId)
    if (scope.type === "league_wide") return true
    if (scope.type === "division_specific") {
        return scope.divisionIds.includes(teamRow.division)
    }
    return false
}
