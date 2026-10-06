import "server-only"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { db } from "@/database/db"
import { users, seasons, divisions } from "@/database/schema"
import { desc } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/next/session"

export interface SeasonOption {
    id: number
    code: string
    year: number
    season: string
}

export interface DivisionOption {
    id: number
    name: string
    level: number
}

export interface UserOption {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preferred_name: string | null
}

export const getCreateTeamsData = withAction(
    async (): Promise<
        ActionResult<{
            seasons: SeasonOption[]
            divisions: DivisionOption[]
            users: UserOption[]
        }>
    > => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }

        try {
            const [allSeasons, allDivisions, allUsers] = await Promise.all([
                db
                    .select({
                        id: seasons.id,
                        code: seasons.code,
                        year: seasons.year,
                        season: seasons.season
                    })
                    .from(seasons)
                    .orderBy(desc(seasons.year), desc(seasons.id)),
                db
                    .select({
                        id: divisions.id,
                        name: divisions.name,
                        level: divisions.level
                    })
                    .from(divisions)
                    .orderBy(divisions.level),
                db
                    .select({
                        id: users.id,
                        old_id: users.old_id,
                        first_name: users.first_name,
                        last_name: users.last_name,
                        preferred_name: users.preferred_name
                    })
                    .from(users)
                    .orderBy(users.last_name, users.first_name)
            ])

            return ok({
                seasons: allSeasons,
                divisions: allDivisions,
                users: allUsers
            })
        } catch (error) {
            logger.error("Error fetching create teams data", undefined, error)
            return fail("Something went wrong.")
        }
    }
)
