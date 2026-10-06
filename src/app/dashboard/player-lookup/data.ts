import "server-only"

import { withAction, ok, fail } from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { ne } from "drizzle-orm"
import { isCommissionerBySession } from "@/next/session"
import { GHOST_CAPTAIN_ID } from "@/lib/ghost-captain"

export interface PlayerListItem {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preferred_name: string | null
}

export const getPlayersForLookup = withAction(
    async (): Promise<ActionResult<PlayerListItem[]>> => {
        const hasAccess = await isCommissionerBySession()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }

        const allUsers = await db
            .select({
                id: users.id,
                old_id: users.old_id,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name
            })
            .from(users)
            .where(ne(users.id, GHOST_CAPTAIN_ID))
            .orderBy(users.last_name, users.first_name)

        return ok(allUsers)
    }
)
