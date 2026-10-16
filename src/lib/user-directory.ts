import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import { signups, userRoles, users } from "@/database/schema"
import { formatPlayerName } from "@/lib/utils"

// Full member directory (id + display name), used by the signup wizard's
// pair-pick combobox. Lives here as a server-only query on purpose: it used
// to be an exported server action, which made the whole directory a
// network-callable endpoint. Callers pass the viewer's id after resolving
// the session; an empty id yields [] as a last line of defense.
//
// Sign-up needs no verified address, so a throwaway account would otherwise
// see every member's name the moment it was created. The viewer must have
// proven their address, have played before (a signup row), or hold a role
// (granted by an admin who knows them).
export async function listUserNames(
    viewerUserId: string
): Promise<{ id: string; name: string }[]> {
    if (!viewerUserId) return []
    if (!(await mayBrowseDirectory(viewerUserId))) return []

    const allUsers = await db
        .select({
            id: users.id,
            first_name: users.first_name,
            last_name: users.last_name,
            preferred_name: users.preferred_name
        })
        .from(users)
        .orderBy(users.last_name, users.first_name)

    return allUsers.map((u) => ({
        id: u.id,
        name: formatPlayerName(u.first_name, u.last_name, u.preferred_name)
    }))
}

async function mayBrowseDirectory(viewerUserId: string): Promise<boolean> {
    const [viewer] = await db
        .select({ emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.id, viewerUserId))
        .limit(1)
    if (!viewer) return false
    if (viewer.emailVerified) return true

    const [signup] = await db
        .select({ id: signups.id })
        .from(signups)
        .where(eq(signups.player, viewerUserId))
        .limit(1)
    if (signup) return true

    const [role] = await db
        .select({ id: userRoles.id })
        .from(userRoles)
        .where(eq(userRoles.user_id, viewerUserId))
        .limit(1)
    return role !== undefined
}
