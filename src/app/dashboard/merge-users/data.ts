import "server-only"

import { db } from "@/database/db"
import { users } from "@/database/schema"
import { ne } from "drizzle-orm"
import { GHOST_CAPTAIN_ID } from "@/lib/ghost-captain"
import { getSessionUser } from "@/next/session"
import { isAdminOrDirector } from "@/lib/rbac"
import { formatDisplayName } from "@/lib/utils"

export interface UserOption {
    id: string
    name: string
    email: string
    phone: string | null
    createdAt: Date
}

/**
 * Every account, for both pickers. The two sides are symmetric -- there is no
 * "old" and "new" -- so one list serves both.
 *
 * The authorization guard is inlined in the exported action below rather than
 * living here, so that it is enforced at the action boundary as AGENTS.md
 * requires and so scripts/security/authz-regression-check.js can see it. A
 * guard behind a delegate is invisible to that check, which is the point of
 * the check.
 */
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

export async function getMergeableUsers(): Promise<UserOption[]> {
    const user = await getSessionUser()
    if (!user || !(await isAdminOrDirector(user.id))) {
        return []
    }
    return listMergeableUsers()
}
