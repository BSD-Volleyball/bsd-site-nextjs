import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { formatPlayerName } from "@/lib/utils"

// Full member directory (id + display name), used by the signup wizard's
// pair-pick combobox. Lives here as a server-only query on purpose: it used
// to be an exported server action, which made the whole directory a
// network-callable endpoint. Requires a session; returns [] otherwise.
export async function listUserNames(): Promise<{ id: string; name: string }[]> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return []

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
