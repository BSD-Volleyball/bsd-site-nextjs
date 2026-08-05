"use server"

import { revalidatePath } from "next/cache"
import { and, asc, eq, isNull, or } from "drizzle-orm"

import { db } from "@/database/db"
import { signups, userRoles, users } from "@/database/schema"
import {
    fail,
    ok,
    requireAdmin,
    requireNonEmptyString,
    requireSeasonConfig,
    requireSession,
    withAction,
    type ActionResult
} from "@/lib/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import { grantRole, revokeRole } from "@/lib/rbac"
import { formatSeasonLabel } from "@/lib/season-utils"
import { formatPlayerName } from "@/lib/utils"

export interface VolunteerCandidate {
    userId: string
    name: string
    email: string
    /** True when the player ticked "willing to help run tryouts" at signup. */
    willing: boolean
    /** True when they currently hold the tryout_volunteer role this season. */
    isVolunteer: boolean
}

export interface PickTryoutVolunteersView {
    seasonId: number
    seasonLabel: string
    /** Players who offered to help on their season signup. */
    willing: VolunteerCandidate[]
    /** Current volunteers who did NOT come from the willing list. */
    added: VolunteerCandidate[]
    /** Everyone, for the "add anyone else" picker. */
    allUsers: { id: string; name: string; email: string }[]
}

export const getPickTryoutVolunteersView = withAction(
    async (): Promise<ActionResult<PickTryoutVolunteersView>> => {
        await requireAdmin()
        const config = await requireSeasonConfig()

        const [willingRows, volunteerRows, allUserRows] = await Promise.all([
            db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name,
                    email: users.email
                })
                .from(signups)
                .innerJoin(users, eq(users.id, signups.player))
                .where(
                    and(
                        eq(signups.season, config.seasonId),
                        eq(signups.tryout_help, true)
                    )
                )
                .orderBy(asc(users.last_name), asc(users.first_name)),
            db
                .select({ userId: userRoles.user_id })
                .from(userRoles)
                .where(
                    and(
                        eq(userRoles.role, "tryout_volunteer"),
                        or(
                            eq(userRoles.season_id, config.seasonId),
                            isNull(userRoles.season_id)
                        )
                    )
                ),
            db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name,
                    email: users.email
                })
                .from(users)
                .orderBy(asc(users.last_name), asc(users.first_name))
        ])

        const volunteerIds = new Set(volunteerRows.map((r) => r.userId))

        const willing: VolunteerCandidate[] = willingRows.map((row) => ({
            userId: row.id,
            name: formatPlayerName(
                row.firstName,
                row.lastName,
                row.preferredName
            ),
            email: row.email,
            willing: true,
            isVolunteer: volunteerIds.has(row.id)
        }))

        const willingIds = new Set(willing.map((w) => w.userId))
        const added: VolunteerCandidate[] = allUserRows
            .filter(
                (row) => volunteerIds.has(row.id) && !willingIds.has(row.id)
            )
            .map((row) => ({
                userId: row.id,
                name: formatPlayerName(
                    row.firstName,
                    row.lastName,
                    row.preferredName
                ),
                email: row.email,
                willing: false,
                isVolunteer: true
            }))

        return ok({
            seasonId: config.seasonId,
            seasonLabel: formatSeasonLabel(config),
            willing,
            added,
            allUsers: allUserRows.map((row) => ({
                id: row.id,
                name: formatPlayerName(
                    row.firstName,
                    row.lastName,
                    row.preferredName
                ),
                email: row.email
            }))
        })
    }
)

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
