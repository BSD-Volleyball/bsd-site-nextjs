import "server-only"

import { logger } from "@/lib/logger"
import { db } from "@/database/db"
import { users, userRoles } from "@/database/schema"
import { eq } from "drizzle-orm"
import { hasPermissionBySession } from "@/next/session"
import { getSeasonConfig } from "@/lib/site-config"

export interface AssignableAdmin {
    id: string
    name: string
}

export async function getAssignableAdmins(): Promise<AssignableAdmin[]> {
    const config = await getSeasonConfig()
    const canView = config.seasonId
        ? await hasPermissionBySession("admin_emails:view", {
              seasonId: config.seasonId
          })
        : false
    if (!canView) return []

    try {
        const rows = await db
            .select({
                id: userRoles.user_id,
                name: users.name
            })
            .from(userRoles)
            .leftJoin(users, eq(userRoles.user_id, users.id))
            .where(eq(userRoles.role, "admin"))

        const seen = new Set<string>()
        const result: AssignableAdmin[] = []

        for (const r of rows) {
            if (!seen.has(r.id)) {
                seen.add(r.id)
                result.push({ id: r.id, name: r.name ?? r.id })
            }
        }

        return result.sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
        logger.error("Error fetching assignable admins", undefined, error)
        return []
    }
}
