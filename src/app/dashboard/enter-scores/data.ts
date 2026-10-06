import "server-only"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { asc, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { matches } from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import { hasPermissionBySession } from "@/next/session"

async function getEnterScoresSeasonId(): Promise<number | null> {
    const config = await getSeasonConfig()
    return config.seasonId || null
}

export interface MatchDateOption {
    date: string
    label: string
    isPlayoff: boolean
}

export const getMatchDatesForSeason = withAction(
    async (): Promise<ActionResult<MatchDateOption[]>> => {
        const seasonId = await getEnterScoresSeasonId()
        const hasAccess = seasonId
            ? await hasPermissionBySession("scores:enter", { seasonId })
            : false
        if (!hasAccess || !seasonId) {
            return fail("Unauthorized")
        }

        try {
            const rows = await db
                .select({
                    date: matches.date,
                    playoff: matches.playoff
                })
                .from(matches)
                .where(eq(matches.season, seasonId))
                .orderBy(asc(matches.date))

            const dateMap = new Map<string, boolean>()
            for (const row of rows) {
                if (!row.date) continue
                const existing = dateMap.get(row.date)
                // If any match on this date is a playoff match, mark as playoff
                if (existing === undefined) {
                    dateMap.set(row.date, row.playoff)
                } else if (row.playoff) {
                    dateMap.set(row.date, true)
                }
            }

            const dates: MatchDateOption[] = []
            for (const [date, isPlayoff] of dateMap) {
                const [year, month, day] = date.split("-")
                const label = `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}${isPlayoff ? " (Playoffs)" : ""}`
                dates.push({ date, label, isPlayoff })
            }

            return ok(dates)
        } catch (error) {
            logger.error("Error fetching match dates", undefined, error)
            return fail("Failed to load match dates.")
        }
    }
)
