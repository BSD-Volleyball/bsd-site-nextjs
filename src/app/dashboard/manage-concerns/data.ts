import "server-only"

import { logger } from "@/lib/logger"
import { db } from "@/database/db"
import { users, userRoles } from "@/database/schema"
import { eq } from "drizzle-orm"
import { hasPermissionBySession } from "@/next/session"
import { getSeasonConfig } from "@/lib/site-config"

export interface AssignableUser {
    id: string
    name: string
    role: string
}

export async function getAssignableUsers(): Promise<AssignableUser[]> {
    const config = await getSeasonConfig()
    const canView = config.seasonId
        ? await hasPermissionBySession("concerns:view", {
              seasonId: config.seasonId
          })
        : false
    if (!canView) return []

    try {
        // Get only users with the ombudsman role
        const rows = await db
            .select({
                id: userRoles.user_id,
                role: userRoles.role,
                name: users.name
            })
            .from(userRoles)
            .leftJoin(users, eq(userRoles.user_id, users.id))
            .where(eq(userRoles.role, "ombudsman"))

        const seen = new Set<string>()
        const result: AssignableUser[] = []

        for (const r of rows) {
            if (!seen.has(r.id)) {
                seen.add(r.id)
                result.push({ id: r.id, name: r.name ?? r.id, role: r.role })
            }
        }

        return result.sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
        logger.error("Error fetching assignable users", undefined, error)
        return []
    }
}
