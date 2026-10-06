import "server-only"

import { formatSeasonRowLabel } from "@/lib/season-utils"
import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { db } from "@/database/db"
import { seasons } from "@/database/schema"
import { desc } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/next/session"
import type { SeasonPhase } from "@/lib/season-phases"

export const getCurrentSeasonPhaseData = withAction(
    async (): Promise<
        ActionResult<{
            seasonId: number
            seasonLabel: string
            phase: SeasonPhase
        }>
    > => {
        const isAdmin = await isAdminOrDirectorBySession()
        if (!isAdmin) {
            return fail("Unauthorized")
        }

        try {
            const [season] = await db
                .select({
                    id: seasons.id,
                    year: seasons.year,
                    season: seasons.season,
                    phase: seasons.phase
                })
                .from(seasons)
                .orderBy(desc(seasons.id))
                .limit(1)

            if (!season) {
                return fail("No seasons found")
            }

            return ok({
                seasonId: season.id,
                seasonLabel: formatSeasonRowLabel(season),
                phase: season.phase as SeasonPhase
            })
        } catch (error) {
            logger.error("Failed to get season phase", undefined, error)
            return fail("Failed to load season data")
        }
    }
)
