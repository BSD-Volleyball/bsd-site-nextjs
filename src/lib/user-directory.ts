import { db } from "@/database/db"
import { users } from "@/database/schema"
import { formatPlayerName } from "@/lib/utils"

// Full member directory (id + display name), used by the signup wizard's
// pair-pick combobox. Lives here as a server-only query on purpose: it used
// to be an exported server action, which made the whole directory a
// network-callable endpoint. Callers pass the viewer's id after resolving
// the session; an empty id yields [] as a last line of defense.
export async function listUserNames(
    viewerUserId: string
): Promise<{ id: string; name: string }[]> {
    if (!viewerUserId) return []

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
