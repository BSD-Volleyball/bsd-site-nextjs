"use server"

import { db } from "@/database/db"
import {
    matchReferees,
    matches,
    teams,
    divisions
} from "@/database/schema"
import { eq, and, gte, asc } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import {
    withAction,
    ok,
    requireSession,
    requireSeasonConfig
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"

export type ReffingScheduleMatch = {
    matchId: number
    date: string
    time: string
    court: number | null
    divisionName: string
    homeTeamName: string
    awayTeamName: string
    isPlayoff: boolean
}

export type ReffingScheduleData = {
    seasonLabel: string
    matches: ReffingScheduleMatch[]
}

export const getReffingScheduleData = withAction(
    async (): Promise<ActionResult<ReffingScheduleData>> => {
        const session = await requireSession()
        const config = await requireSeasonConfig()
        const userId = session.user.id
        const seasonId = config.seasonId

        const today = new Date().toISOString().slice(0, 10)

        const homeTeam = alias(teams, "homeTeam")
        const awayTeam = alias(teams, "awayTeam")

        const rows = await db
            .select({
                matchId: matches.id,
                date: matches.date,
                time: matches.time,
                court: matches.court,
                divisionName: divisions.name,
                homeTeamName: homeTeam.name,
                awayTeamName: awayTeam.name,
                isPlayoff: matches.playoff
            })
            .from(matchReferees)
            .innerJoin(matches, eq(matchReferees.match_id, matches.id))
            .innerJoin(divisions, eq(matches.division, divisions.id))
            .innerJoin(homeTeam, eq(matches.home_team, homeTeam.id))
            .innerJoin(awayTeam, eq(matches.away_team, awayTeam.id))
            .where(
                and(
                    eq(matchReferees.referee_id, userId),
                    eq(matchReferees.season_id, seasonId),
                    gte(matches.date, today)
                )
            )
            .orderBy(asc(matches.date), asc(matches.time))

        return ok({
            seasonLabel: `${config.seasonYear} ${config.seasonName}`,
            matches: rows.map((r) => ({
                matchId: r.matchId,
                date: r.date ?? "",
                time: r.time ?? "",
                court: r.court,
                divisionName: r.divisionName,
                homeTeamName: r.homeTeamName,
                awayTeamName: r.awayTeamName,
                isPlayoff: r.isPlayoff
            }))
        })
    }
)
