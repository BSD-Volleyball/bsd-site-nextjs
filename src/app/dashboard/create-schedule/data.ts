import "server-only"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { db } from "@/database/db"
import { divisions, teams, individual_divisions } from "@/database/schema"
import { eq, asc } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/next/session"
import { getSeasonConfig, getEventsByType } from "@/lib/site-config"

export interface DivisionWithTeams {
    divisionId: number
    divisionName: string
    level: number
    teamCount: number
    teams: { id: number; number: number | null; name: string }[]
}

export const getCreateScheduleData = withAction(
    async (): Promise<
        ActionResult<{
            seasonId: number
            seasonLabel: string
            seasonName: string
            phase: string
            divisions: DivisionWithTeams[]
            seasonDates: string[]
            seasonTimes: string[]
            playoffDates: string[]
        }>
    > => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }

        try {
            const config = await getSeasonConfig()
            if (!config.seasonId) {
                return fail("No active season found.")
            }

            const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

            // Get divisions for this season via individual_divisions
            const indivDivs = await db
                .select({
                    divisionId: individual_divisions.division,
                    teams: individual_divisions.teams,
                    divName: divisions.name,
                    divLevel: divisions.level
                })
                .from(individual_divisions)
                .innerJoin(
                    divisions,
                    eq(individual_divisions.division, divisions.id)
                )
                .where(eq(individual_divisions.season, config.seasonId))
                .orderBy(asc(divisions.level))

            // Get teams for this season grouped by division
            const allTeams = await db
                .select({
                    id: teams.id,
                    division: teams.division,
                    number: teams.number,
                    name: teams.name
                })
                .from(teams)
                .where(eq(teams.season, config.seasonId))
                .orderBy(asc(teams.number))

            const teamsByDivision = new Map<
                number,
                { id: number; number: number | null; name: string }[]
            >()
            for (const t of allTeams) {
                if (!teamsByDivision.has(t.division)) {
                    teamsByDivision.set(t.division, [])
                }
                teamsByDivision.get(t.division)!.push({
                    id: t.id,
                    number: t.number,
                    name: t.name
                })
            }

            const divisionsData: DivisionWithTeams[] = indivDivs.map((d) => ({
                divisionId: d.divisionId,
                divisionName: d.divName,
                level: d.divLevel,
                teamCount: d.teams,
                teams: teamsByDivision.get(d.divisionId) || []
            }))

            const regularSeason = getEventsByType(config, "regular_season")
            const seasonDates = regularSeason.map((e) => e.eventDate)

            const seasonTimes =
                regularSeason[0]?.timeSlots.map((ts) => ts.startTime) ?? []

            const playoffDates = getEventsByType(config, "playoff").map(
                (e) => e.eventDate
            )

            return ok({
                seasonId: config.seasonId,
                seasonLabel,
                seasonName: config.seasonName,
                phase: config.phase,
                divisions: divisionsData,
                seasonDates,
                seasonTimes,
                playoffDates
            })
        } catch (error) {
            logger.error(
                "Error fetching create schedule data",
                undefined,
                error
            )
            return fail("Something went wrong loading schedule data.")
        }
    }
)
