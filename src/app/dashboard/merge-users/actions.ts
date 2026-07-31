"use server"

import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq, ne } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/lib/action-helpers"
import { fail, ok, requireSession, withAction } from "@/lib/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import { GHOST_CAPTAIN_ID } from "@/lib/ghost-captain"
import { mergeUserRecords } from "@/lib/merge-users"
import { getSessionUser, isAdminOrDirector } from "@/lib/rbac"
import { formatDisplayName } from "@/lib/utils"

export interface UserOption {
    id: string
    name: string
    email: string
    phone: string | null
    createdAt: Date
}

// Both sides of the merge form draw from the same pool: any account may be
// merged into any other, in either direction.
//
// The guard lives in each exported action rather than here, so that
// authorization is enforced at the action boundary as AGENTS.md requires --
// and so scripts/security/authz-regression-check.js can see it. A guard behind
// a delegate is invisible to that check, which is the point of the check.
async function listMergeableUsers(): Promise<UserOption[]> {
    const results = await db
        .select({
            id: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            email: users.email,
            phone: users.phone,
            createdAt: users.createdAt
        })
        .from(users)
        .where(ne(users.id, GHOST_CAPTAIN_ID))
        .orderBy(users.last_name, users.first_name)

    return results.map((u) => ({
        id: u.id,
        name: formatDisplayName(u.firstName, u.lastName, u.preferredName),
        email: u.email,
        phone: u.phone,
        createdAt: u.createdAt
    }))
}

export async function getOldUsers(): Promise<UserOption[]> {
    const user = await getSessionUser()
    if (!user || !(await isAdminOrDirector(user.id))) {
        return []
    }
    return listMergeableUsers()
}

export async function getNewUsers(): Promise<UserOption[]> {
    const user = await getSessionUser()
    if (!user || !(await isAdminOrDirector(user.id))) {
        return []
    }
    return listMergeableUsers()
}

export const mergeUsers = withAction(
    async (oldUserId: string, newUserId: string): Promise<ActionResult> => {
        const session = await requireSession()

        const hasAccess = await isAdminOrDirector(session.user.id)
        if (!hasAccess) {
            return fail("Access denied.")
        }

        if (oldUserId === newUserId) {
            return fail("Cannot merge a user with themselves.")
        }

        try {
            const [oldUser] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.id, oldUserId))
                .limit(1)

            if (!oldUser) {
                return fail("Old user not found.")
            }

            const [newUser] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.id, newUserId))
                .limit(1)

            if (!newUser) {
                return fail("New user not found.")
            }

            // copyIdentity: the older of two duplicate accounts is normally the
            // one carrying the legacy numeric id and the photo, so those move
            // across to the survivor.
            await mergeUserRecords(oldUserId, newUserId, { copyIdentity: true })

            await logAuditEntry({
                userId: session.user.id,
                action: "merge",
                entityType: "users",
                entityId: newUserId,
                summary: `Merged user ${oldUserId} into ${newUserId} (old user deleted)`
            })

            revalidatePath("/dashboard/merge-users")
            return ok(undefined, "Users merged successfully.")
        } catch (error) {
            console.error("Error merging users:", error)
            return fail("Something went wrong while merging users.")
        }
    }
)
