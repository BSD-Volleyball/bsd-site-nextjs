import "server-only"

import { db } from "@/database/db"
import { matches, seasons } from "@/database/schema"
import { eq, asc } from "drizzle-orm"
import {
    withAction,
    ok,
    fail,
    requireSeasonConfig,
    requirePermission
} from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"
import { formatEventDate } from "@/lib/date-utils"

export interface MatchDate {
    date: string
    label: string
    matchCount: number
}

export interface ScheduleRefsData {
    seasonId: number
    seasonLabel: string
    matchDates: MatchDate[]
}

// ---------------------------------------------------------------------------
// 1. getScheduleRefsData — match dates for current season
// ---------------------------------------------------------------------------

export const getScheduleRefsData = withAction(
    async (): Promise<ActionResult<ScheduleRefsData>> => {
        await requirePermission("schedule:manage")
        const config = await requireSeasonConfig()

        const [season] = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
            .where(eq(seasons.id, config.seasonId))
            .limit(1)

        if (!season) {
            return fail("Season not found.")
        }

        const seasonLabel = `${season.season} ${season.year}`

        const allMatches = await db
            .select({
                date: matches.date
            })
            .from(matches)
            .where(eq(matches.season, config.seasonId))
            .orderBy(asc(matches.date))

        // Build distinct dates with counts
        const dateMap = new Map<string, number>()
        for (const m of allMatches) {
            if (!m.date) continue
            dateMap.set(m.date, (dateMap.get(m.date) ?? 0) + 1)
        }

        const matchDates: MatchDate[] = []
        for (const [date, count] of dateMap) {
            matchDates.push({
                date,
                label: formatEventDate(date),
                matchCount: count
            })
        }

        return ok({ seasonId: config.seasonId, seasonLabel, matchDates })
    }
)
