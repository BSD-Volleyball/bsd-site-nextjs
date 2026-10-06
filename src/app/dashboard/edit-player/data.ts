import "server-only"

import { formatPlayerName } from "@/lib/utils"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { isAdminOrDirectorBySession } from "@/next/session"

export async function getUsers(): Promise<{ id: string; name: string }[]> {
    const hasAccess = await isAdminOrDirectorBySession()
    if (!hasAccess) {
        return []
    }

    const allUsers = await db
        .select({
            id: users.id,
            first_name: users.first_name,
            last_name: users.last_name,
            preferred_name: users.preferred_name
        })
        .from(users)
        .orderBy(users.last_name, users.first_name)

    return allUsers.map((u) => {
        return {
            id: u.id,
            name: formatPlayerName(u.first_name, u.last_name, u.preferred_name)
        }
    })
}
