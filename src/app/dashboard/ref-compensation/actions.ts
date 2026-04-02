"use server"

import { db } from "@/database/db"
import {
    matchReferees,
    matches,
    teams,
    divisions,
    seasons,
    seasonRefs,
    users
} from "@/database/schema"
import { eq, asc } from "drizzle-orm"
import {
    withAction,
    ok,
    requireSession,
    requireSeasonConfig
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"
import { hasPermissionBySession, isAdminOrDirectorBySession } from "@/lib/rbac"
import { formatPlayerName } from "@/lib/utils"

type MatchWorked = {
    matchId: number
    date: string
    time: string
    court: number | null
    divisionName: string
    homeTeamName: string
    awayTeamName: string
    isPlayoff: boolean
}

type RefSummary = {
    userId: string
    name: string
    email: string
    isCertified: boolean
    ratePerMatch: string
    matchesWorked: MatchWorked[]
    totalMatches: number
    totalPay: string
}

type CompensationData = {
    seasonLabel: string
    certifiedRate: string
    uncertifiedRate: string
    refs: RefSummary[]
    grandTotalPay: string
    grandTotalMatches: number
}

export const getRefCompensationData = withAction(
    async (): Promise<ActionResult<CompensationData>> => {
        await requireSession()

        const [canManage, isAdmin] = await Promise.all([
            hasPermissionBySession("schedule:manage"),
            isAdminOrDirectorBySession()
        ])
        if (!canManage && !isAdmin) {
            return ok({
                seasonLabel: "",
                certifiedRate: "0",
                uncertifiedRate: "0",
                refs: [],
                grandTotalPay: "0.00",
                grandTotalMatches: 0
            })
        }

        const { seasonId } = await requireSeasonConfig()

        // Get season info with rates
        const [seasonRow] = await db
            .select({
                year: seasons.year,
                season: seasons.season,
                certifiedRate: seasons.certified_ref_rate,
                uncertifiedRate: seasons.uncertified_ref_rate
            })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1)

        if (!seasonRow) {
            return ok({
                seasonLabel: "",
                certifiedRate: "0",
                uncertifiedRate: "0",
                refs: [],
                grandTotalPay: "0.00",
                grandTotalMatches: 0
            })
        }

        const seasonLabel = `${seasonRow.season.charAt(0).toUpperCase() + seasonRow.season.slice(1)} ${seasonRow.year}`
        const certifiedRate = seasonRow.certifiedRate ?? "0"
        const uncertifiedRate = seasonRow.uncertifiedRate ?? "0"

        // Get all season refs with user info
        const refRows = await db
            .select({
                userId: seasonRefs.user_id,
                isCertified: seasonRefs.is_certified,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                email: users.email
            })
            .from(seasonRefs)
            .innerJoin(users, eq(seasonRefs.user_id, users.id))
            .where(eq(seasonRefs.season_id, seasonId))

        // Get all match referee assignments for the season with match details
        const homeTeam = db
            .select({ id: teams.id, name: teams.name })
            .from(teams)
            .as("home_team_t")
        const awayTeam = db
            .select({ id: teams.id, name: teams.name })
            .from(teams)
            .as("away_team_t")

        const assignmentRows = await db
            .select({
                refereeId: matchReferees.referee_id,
                matchId: matchReferees.match_id,
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
            .leftJoin(homeTeam, eq(matches.home_team, homeTeam.id))
            .leftJoin(awayTeam, eq(matches.away_team, awayTeam.id))
            .where(eq(matchReferees.season_id, seasonId))
            .orderBy(asc(matches.date), asc(matches.time))

        // Index assignments by referee ID
        const assignmentsByRef = new Map<string, MatchWorked[]>()
        for (const row of assignmentRows) {
            const list = assignmentsByRef.get(row.refereeId) ?? []
            list.push({
                matchId: row.matchId,
                date: row.date ?? "",
                time: row.time ?? "",
                court: row.court,
                divisionName: row.divisionName,
                homeTeamName: row.homeTeamName ?? "TBD",
                awayTeamName: row.awayTeamName ?? "TBD",
                isPlayoff: row.isPlayoff
            })
            assignmentsByRef.set(row.refereeId, list)
        }

        // Build per-ref summaries
        const certifiedRateNum = Number.parseFloat(certifiedRate) || 0
        const uncertifiedRateNum = Number.parseFloat(uncertifiedRate) || 0
        let grandTotalPay = 0
        let grandTotalMatches = 0

        const refs: RefSummary[] = refRows
            .map((ref) => {
                const matchesWorked = assignmentsByRef.get(ref.userId) ?? []
                const rate = ref.isCertified
                    ? certifiedRateNum
                    : uncertifiedRateNum
                const totalPay = matchesWorked.length * rate

                grandTotalPay += totalPay
                grandTotalMatches += matchesWorked.length

                return {
                    userId: ref.userId,
                    name: formatPlayerName(
                        ref.firstName,
                        ref.lastName,
                        ref.preferredName
                    ),
                    email: ref.email,
                    isCertified: ref.isCertified,
                    ratePerMatch: rate.toFixed(2),
                    matchesWorked,
                    totalMatches: matchesWorked.length,
                    totalPay: totalPay.toFixed(2)
                }
            })
            .sort((a, b) => a.name.localeCompare(b.name))

        return ok({
            seasonLabel,
            certifiedRate,
            uncertifiedRate,
            refs,
            grandTotalPay: grandTotalPay.toFixed(2),
            grandTotalMatches
        })
    }
)
