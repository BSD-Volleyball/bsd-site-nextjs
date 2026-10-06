import "server-only"

import { db } from "@/database/db"
import { users, signups, seasons } from "@/database/schema"
import { eq, desc } from "drizzle-orm"
import {
    withAction,
    ok,
    fail,
    requireCaptainAccess
} from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"
import { getSeasonConfig } from "@/lib/site-config"

export interface PlayerListItem {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preferred_name: string | null
}

export interface SeasonInfo {
    id: number
    year: number
    name: string
}

export const getSignedUpPlayers = withAction(
    async (): Promise<
        ActionResult<{ players: PlayerListItem[]; allSeasons: SeasonInfo[] }>
    > => {
        await requireCaptainAccess()

        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return fail("No current season found.")
        }

        const signupRows = await db
            .select({
                id: users.id,
                old_id: users.old_id,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, config.seasonId))
            .orderBy(users.last_name, users.first_name)

        const allSeasonRows = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                name: seasons.season
            })
            .from(seasons)
            .orderBy(desc(seasons.id))
            .limit(11)

        return ok({
            players: signupRows,
            allSeasons: allSeasonRows.map((s) => ({
                id: s.id,
                year: s.year,
                name: s.name
            }))
        })
    }
)
