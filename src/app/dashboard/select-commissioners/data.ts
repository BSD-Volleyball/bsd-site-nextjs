import "server-only"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { db } from "@/database/db"
import { seasons, divisions, users } from "@/database/schema"
import { desc, inArray, notInArray } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/next/session"
import { formatPlayerName } from "@/lib/utils"

export interface Season {
    id: number
    code: string
    year: number
    season: string
}

export interface Division {
    id: number
    name: string
}

export interface User {
    id: string
    name: string
}

export const getSeasons = withAction(
    async (): Promise<ActionResult<Season[]>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const allSeasons = await db
                .select({
                    id: seasons.id,
                    code: seasons.code,
                    year: seasons.year,
                    season: seasons.season
                })
                .from(seasons)
                .orderBy(desc(seasons.year), desc(seasons.id))

            return ok(allSeasons)
        } catch (error) {
            logger.error("Error fetching seasons", undefined, error)
            return fail("Failed to load seasons.")
        }
    }
)

export const getCurrentSeason = withAction(
    async (): Promise<ActionResult<number | null>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const [currentSeason] = await db
                .select({ id: seasons.id })
                .from(seasons)
                .where(notInArray(seasons.phase, ["off_season", "complete"]))
                // Deterministic when more than one season exists: prefer the
                // newest in-progress season (matches the max-id "current season"
                // convention used elsewhere).
                .orderBy(desc(seasons.year), desc(seasons.id))
                .limit(1)

            if (currentSeason) {
                return ok(currentSeason.id)
            }

            // If no season has registration open, return the most recent season
            const [mostRecentSeason] = await db
                .select({ id: seasons.id })
                .from(seasons)
                .orderBy(desc(seasons.year), desc(seasons.id))
                .limit(1)

            return ok(mostRecentSeason?.id ?? null)
        } catch (error) {
            logger.error("Error fetching current season", undefined, error)
            return fail("Failed to load current season.")
        }
    }
)

export const getUsers = withAction(async (): Promise<ActionResult<User[]>> => {
    const hasAccess = await isAdminOrDirectorBySession()
    if (!hasAccess) {
        return fail("Unauthorized")
    }

    try {
        const allUsers = await db
            .select({
                id: users.id,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name
            })
            .from(users)
            .orderBy(users.last_name, users.first_name)

        const userList: User[] = allUsers.map((u) => ({
            id: u.id,
            name: formatPlayerName(u.first_name, u.last_name, u.preferred_name)
        }))

        return ok(userList)
    } catch (error) {
        logger.error("Error fetching users", undefined, error)
        return fail("Failed to load users.")
    }
})

export const getDivisions = withAction(
    async (): Promise<ActionResult<Division[]>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const divisionNames = ["AA", "A", "ABA", "ABB", "BBB", "BB"]
            const divisionsList = await db
                .select({
                    id: divisions.id,
                    name: divisions.name
                })
                .from(divisions)
                .where(inArray(divisions.name, divisionNames))

            // Sort by the order we want them displayed
            const sortedDivisions = divisionsList.sort((a, b) => {
                const aIndex = divisionNames.indexOf(a.name)
                const bIndex = divisionNames.indexOf(b.name)
                return aIndex - bIndex
            })

            return ok(sortedDivisions)
        } catch (error) {
            logger.error("Error fetching divisions", undefined, error)
            return fail("Failed to load divisions.")
        }
    }
)
