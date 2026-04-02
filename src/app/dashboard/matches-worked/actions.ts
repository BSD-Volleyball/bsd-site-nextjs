"use server"

import { db } from "@/database/db"
import {
    matchReferees,
    matches,
    teams,
    divisions,
    seasons,
    seasonRefs
} from "@/database/schema"
import { eq, and, lt, desc } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import {
    withAction,
    ok,
    requireSession,
    requireSeasonConfig
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"

export type MatchWorkedEntry = {
    matchId: number
    date: string
    time: string
    court: number | null
    divisionName: string
    homeTeamName: string
    awayTeamName: string
    isPlayoff: boolean
    pay: string
}

export type MatchesWorkedData = {
    seasonLabel: string
    isCertified: boolean
    ratePerMatch: string
    matches: MatchWorkedEntry[]
    totalPay: string
}

export const getMatchesWorkedData = withAction(
    async (): Promise<ActionResult<MatchesWorkedData>> => {
        const session = await requireSession()
        const config = await requireSeasonConfig()
        const userId = session.user.id
        const seasonId = config.seasonId

        // Get ref rates from the season
        const [season] = await db
            .select({
                certifiedRate: seasons.certified_ref_rate,
                uncertifiedRate: seasons.uncertified_ref_rate
            })
            .from(seasons)
            .where(eq(seasons.id, seasonId))

        const certifiedRate = Number(season?.certifiedRate ?? "0")
        const uncertifiedRate = Number(season?.uncertifiedRate ?? "0")

        // Check if user is certified for this season
        const [refRecord] = await db
            .select({ isCertified: seasonRefs.is_certified })
            .from(seasonRefs)
            .where(
                and(
                    eq(seasonRefs.season_id, seasonId),
                    eq(seasonRefs.user_id, userId)
                )
            )

        const isCertified = refRecord?.isCertified ?? false
        const rate = isCertified ? certifiedRate : uncertifiedRate

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
                    lt(matches.date, today)
                )
            )
            .orderBy(desc(matches.date), desc(matches.time))

        const matchEntries: MatchWorkedEntry[] = rows.map((r) => ({
            matchId: r.matchId,
            date: r.date ?? "",
            time: r.time ?? "",
            court: r.court,
            divisionName: r.divisionName,
            homeTeamName: r.homeTeamName,
            awayTeamName: r.awayTeamName,
            isPlayoff: r.isPlayoff,
            pay: rate.toFixed(2)
        }))

        const totalPay = (rate * matchEntries.length).toFixed(2)

        return ok({
            seasonLabel: `${config.seasonYear} ${config.seasonName}`,
            isCertified,
            ratePerMatch: rate.toFixed(2),
            matches: matchEntries,
            totalPay
        })
    }
)
