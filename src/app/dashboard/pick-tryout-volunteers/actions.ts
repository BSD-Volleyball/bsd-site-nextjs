"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"

import { db } from "@/database/db"
import { users } from "@/database/schema"
import {
    fail,
    ok,
    requireAdmin,
    requireNonEmptyString,
    requireSeasonConfig,
    requireSession,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import { grantRole, revokeRole } from "@/lib/rbac"
import { formatSeasonLabel } from "@/lib/season-utils"
import { formatPlayerName } from "@/lib/utils"

/**
 * Grants or revokes the season-scoped tryout_volunteer role. The role
 * carries no permissions, so there is no privilege to strip from live
 * sessions on revoke — if it ever gains permissions, add an
 * invalidateAllSessionsForUser() call here.
 */
export const setTryoutVolunteer = withAction(
    async (userId: string, enabled: boolean): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()
        const config = await requireSeasonConfig()
        const targetId = requireNonEmptyString(userId, "User")

        const [target] = await db
            .select({
                id: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(users)
            .where(eq(users.id, targetId))
            .limit(1)
        if (!target) return fail("User not found.")

        const name = formatPlayerName(
            target.firstName,
            target.lastName,
            target.preferredName
        )

        if (enabled) {
            await grantRole(targetId, "tryout_volunteer", {
                seasonId: config.seasonId,
                grantedBy: session.user.id
            })
        } else {
            await revokeRole(targetId, "tryout_volunteer", {
                seasonId: config.seasonId
            })
        }

        await logAuditEntry({
            userId: session.user.id,
            action: enabled
                ? "grant_tryout_volunteer"
                : "revoke_tryout_volunteer",
            entityType: "user_roles",
            entityId: targetId,
            summary: `${enabled ? "Granted" : "Revoked"} Tryout Volunteer for ${name} (${formatSeasonLabel(config)})`
        })

        revalidatePath("/dashboard/pick-tryout-volunteers")
        revalidatePath("/dashboard/assign-tryout-jobs")
        revalidatePath("/dashboard/manage-roles")

        return ok(
            undefined,
            enabled
                ? `${name} is now a Tryout Volunteer.`
                : `${name} is no longer a Tryout Volunteer.`
        )
    }
)
