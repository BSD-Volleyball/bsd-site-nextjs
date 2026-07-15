import "server-only"

import { and, count, desc, eq, inArray, ne } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { cache } from "react"
import { db } from "@/database/db"
import {
    champions,
    divisions,
    drafts,
    matches,
    matchSubstitutions,
    seasons,
    substitutions,
    teams,
    users
} from "@/database/schema"
import {
    buildMatchRosters,
    computePlayerElo,
    type EloHistoryPoint,
    type EloMatchInput
} from "@/lib/player-elo"
import { computeCareerStats, type CareerStats } from "@/lib/player-career-stats"
import { getLastDraftInfoByUser } from "@/lib/roster"
import { formatPlayerName } from "@/lib/utils"

export interface ChampionshipEntry {
    seasonLabel: string
    divisionName: string
    teamName: string | null
}

export interface FrequentPerson {
    userId: string
    name: string
    count: number
}

export interface PersonalAnalytics {
    eloHistory: EloHistoryPoint[]
    currentRating: number | null
    ratedMatches: number
    careerStats: CareerStats
    championships: ChampionshipEntry[]
    topTeammates: FrequentPerson[]
    topCaptains: FrequentPerson[]
}

export interface LeaderboardRow {
    userId: string
    name: string
    rating: number
    matches: number
    divisionLabel: string | null
}

function formatSeasonLabel(name: string, year: number): string {
    return `${name.charAt(0).toUpperCase() + name.slice(1)} ${year}`
}

/**
 * League-wide player ELO from all recorded match results. Rosters are derived
 * from drafts plus permanent and per-match substitutions. cache() memoizes per
 * request so the personal trend and the leaderboard share one computation.
 */
const getLeagueElo = cache(async () => {
    const matchRows: EloMatchInput[] = await db
        .select({
            id: matches.id,
            seasonId: matches.season,
            week: matches.week,
            date: matches.date,
            playoff: matches.playoff,
            divisionLevel: divisions.level,
            homeTeamId: matches.home_team,
            awayTeamId: matches.away_team,
            winner: matches.winner,
            homeScore: matches.home_score,
            awayScore: matches.away_score,
            home_set1_score: matches.home_set1_score,
            away_set1_score: matches.away_set1_score,
            home_set2_score: matches.home_set2_score,
            away_set2_score: matches.away_set2_score,
            home_set3_score: matches.home_set3_score,
            away_set3_score: matches.away_set3_score
        })
        .from(matches)
        .innerJoin(divisions, eq(matches.division, divisions.id))

    const matchSeasonIds = [...new Set(matchRows.map((m) => m.seasonId))]
    if (matchSeasonIds.length === 0) {
        return {
            matches: matchRows,
            rosters: new Map<string, string[]>(),
            ...computePlayerElo([], new Map())
        }
    }

    const [draftRows, permanentSubs, matchSubs] = await Promise.all([
        db
            .select({
                draftId: drafts.id,
                teamId: drafts.team,
                userId: drafts.user
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(inArray(teams.season, matchSeasonIds)),
        db
            .select({
                id: substitutions.id,
                originalDraft: substitutions.original_draft,
                subUser: substitutions.sub_user,
                effectiveAt: substitutions.effective_at
            })
            .from(substitutions)
            .where(inArray(substitutions.season, matchSeasonIds)),
        db
            .select({
                matchId: matchSubstitutions.match,
                teamId: matchSubstitutions.team,
                originalUser: matchSubstitutions.original_user,
                subUser: matchSubstitutions.sub_user
            })
            .from(matchSubstitutions)
            .where(inArray(matchSubstitutions.season, matchSeasonIds))
    ])

    const rosters = buildMatchRosters(
        matchRows,
        draftRows,
        permanentSubs,
        matchSubs
    )
    return {
        matches: matchRows,
        rosters,
        ...computePlayerElo(matchRows, rosters)
    }
})

/**
 * Championships won: seasons where the user was on the champion team, either
 * as a draftee or as a permanent sub. Coverage follows draft data (~2010+).
 */
async function getChampionships(userId: string): Promise<ChampionshipEntry[]> {
    const base = () =>
        db
            .select({
                teamId: champions.team,
                seasonId: seasons.id,
                seasonYear: seasons.year,
                seasonName: seasons.season,
                divisionName: divisions.name,
                teamName: teams.name
            })
            .from(champions)
            .innerJoin(teams, eq(champions.team, teams.id))
            .innerJoin(seasons, eq(champions.season, seasons.id))
            .innerJoin(divisions, eq(champions.division, divisions.id))

    const [asDraftee, asSub] = await Promise.all([
        base()
            .innerJoin(drafts, eq(drafts.team, champions.team))
            .where(eq(drafts.user, userId)),
        base()
            .innerJoin(substitutions, eq(substitutions.team, champions.team))
            .where(eq(substitutions.sub_user, userId))
    ])

    const byTeam = new Map<number, (typeof asDraftee)[number]>()
    for (const row of [...asDraftee, ...asSub]) byTeam.set(row.teamId, row)
    return [...byTeam.values()]
        .sort((a, b) => b.seasonYear - a.seasonYear || b.seasonId - a.seasonId)
        .map((row) => ({
            seasonLabel: formatSeasonLabel(row.seasonName, row.seasonYear),
            divisionName: row.divisionName,
            teamName: row.teamName
        }))
}

async function getTopTeammates(
    userId: string,
    limit: number
): Promise<FrequentPerson[]> {
    const teammateDrafts = alias(drafts, "teammate_drafts")
    return db
        .select({
            userId: teammateDrafts.user,
            name: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            count: count()
        })
        .from(drafts)
        .innerJoin(teammateDrafts, eq(drafts.team, teammateDrafts.team))
        .innerJoin(users, eq(teammateDrafts.user, users.id))
        .where(and(eq(drafts.user, userId), ne(teammateDrafts.user, userId)))
        .groupBy(
            teammateDrafts.user,
            users.first_name,
            users.last_name,
            users.preferred_name
        )
        .orderBy(desc(count()))
        .limit(limit)
        .then((rows) =>
            rows.map((row) => ({
                userId: row.userId,
                name: formatPlayerName(
                    row.name,
                    row.lastName,
                    row.preferredName
                ),
                count: row.count
            }))
        )
}

async function getTopCaptains(
    userId: string,
    limit: number
): Promise<FrequentPerson[]> {
    const teamRows = await db
        .select({ captain: teams.captain, captain2: teams.captain2 })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .where(eq(drafts.user, userId))

    const counts = new Map<string, number>()
    for (const row of teamRows) {
        for (const captain of [row.captain, row.captain2]) {
            if (!captain || captain === userId) continue
            counts.set(captain, (counts.get(captain) ?? 0) + 1)
        }
    }
    const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
    if (top.length === 0) return []

    const nameRows = await db
        .select({
            id: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name
        })
        .from(users)
        .where(
            inArray(
                users.id,
                top.map(([id]) => id)
            )
        )
    const names = new Map(
        nameRows.map((u) => [
            u.id,
            formatPlayerName(u.firstName, u.lastName, u.preferredName)
        ])
    )
    return top.map(([id, tally]) => ({
        userId: id,
        name: names.get(id) ?? "Unknown player",
        count: tally
    }))
}

export async function getPersonalAnalytics(
    userId: string
): Promise<PersonalAnalytics> {
    const [league, championships, topTeammates, topCaptains] =
        await Promise.all([
            getLeagueElo(),
            getChampionships(userId),
            getTopTeammates(userId, 5),
            getTopCaptains(userId, 5)
        ])

    return {
        eloHistory: league.histories.get(userId) ?? [],
        currentRating: league.ratings.get(userId) ?? null,
        ratedMatches: league.matchCounts.get(userId) ?? 0,
        careerStats: computeCareerStats(userId, league.matches, league.rosters),
        championships,
        topTeammates,
        topCaptains
    }
}

export async function getEloLeaderboard(
    limit = 25,
    minMatches = 10
): Promise<LeaderboardRow[]> {
    const league = await getLeagueElo()
    const qualified = [...league.ratings.entries()]
        .filter(
            ([userId]) => (league.matchCounts.get(userId) ?? 0) >= minMatches
        )
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
    if (qualified.length === 0) return []

    const userIds = qualified.map(([id]) => id)
    const [nameRows, lastDrafts] = await Promise.all([
        db
            .select({
                id: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(users)
            .where(inArray(users.id, userIds)),
        getLastDraftInfoByUser(userIds)
    ])
    const names = new Map(
        nameRows.map((u) => [
            u.id,
            formatPlayerName(u.firstName, u.lastName, u.preferredName)
        ])
    )

    return qualified.map(([userId, rating]) => {
        const lastDraft = lastDrafts.get(userId)
        return {
            userId,
            name: names.get(userId) ?? "Unknown player",
            rating,
            matches: league.matchCounts.get(userId) ?? 0,
            divisionLabel: lastDraft
                ? `${lastDraft.divisionName} · ${lastDraft.seasonLabel}`
                : null
        }
    })
}
