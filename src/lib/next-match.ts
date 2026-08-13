/**
 * next-match.ts — schedule lookups for a single player in a season.
 *
 * These helpers perform NO authorization checks: callers must gate access
 * (e.g. self-only, admin, or friendship) before invoking them.
 */

import { db } from "@/database/db"
import {
    teams,
    drafts,
    divisions,
    matches,
    seasonEvents,
    signups,
    userUnavailability
} from "@/database/schema"
import { eq, and, or, asc, desc, isNull, isNotNull } from "drizzle-orm"
import { formatMatchTime } from "@/lib/season-utils"
import { getSetScores } from "@/lib/team-ranking"

export interface NextMatch {
    date: string
    time: string | null
    court: number | null
    opponentName: string
    divisionName: string
    week: number
    isUnavailable: boolean
}

export interface LastMatchResult {
    won: boolean
    myGames: number
    oppGames: number
    opponentName: string
    week: number
    date: string | null
}

async function findTeamForUser(userId: string, seasonId: number) {
    const [draftRecord] = await db
        .select({ teamId: teams.id, divisionId: teams.division })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .where(and(eq(drafts.user, userId), eq(teams.season, seasonId)))
        .limit(1)
    return draftRecord ?? null
}

/**
 * Real team names are hidden until a division's draft has happened; before
 * that, fall back to "Team N" (mirrors the season schedule pages).
 */
async function resolveOpponentName(opponentTeamId: number): Promise<{
    name: string
} | null> {
    const [opponent] = await db
        .select({
            number: teams.number,
            name: teams.name,
            divisionId: teams.division
        })
        .from(teams)
        .where(eq(teams.id, opponentTeamId))
        .limit(1)
    if (!opponent) return null

    const [draftedCheck] = await db
        .select({ teamId: drafts.team })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .where(eq(teams.division, opponent.divisionId))
        .limit(1)

    const name = draftedCheck
        ? opponent.name
        : opponent.number !== null
          ? `Team ${opponent.number}`
          : opponent.name
    return { name }
}

/** Next unplayed match for the user's team this season. No authz. */
export async function getNextMatchForUser(
    userId: string,
    seasonId: number
): Promise<NextMatch | null> {
    try {
        const draftRecord = await findTeamForUser(userId, seasonId)
        if (!draftRecord) return null

        const [nextMatchRow] = await db
            .select({
                id: matches.id,
                date: matches.date,
                time: matches.time,
                court: matches.court,
                week: matches.week,
                playoff: matches.playoff,
                homeTeamId: matches.home_team,
                awayTeamId: matches.away_team,
                divisionId: matches.division
            })
            .from(matches)
            .where(
                and(
                    eq(matches.season, seasonId),
                    // Unplayed matches: no score entered via either scoring mode
                    isNull(matches.home_score),
                    isNull(matches.home_set1_score),
                    or(
                        eq(matches.home_team, draftRecord.teamId),
                        eq(matches.away_team, draftRecord.teamId)
                    )
                )
            )
            .orderBy(matches.week, matches.time)
            .limit(1)

        if (!nextMatchRow) return null

        // Always resolve the season event by week so we can check availability.
        // The match.date column may be set directly, but availability is stored
        // against season_events entries — so we need matchEventId regardless.
        let matchDate: string | null = nextMatchRow.date
        let matchEventId: number | null = null
        const eventType = nextMatchRow.playoff ? "playoff" : "regular_season"
        const seasonEventsForType = await db
            .select({
                eventDate: seasonEvents.event_date,
                id: seasonEvents.id
            })
            .from(seasonEvents)
            .where(
                and(
                    eq(seasonEvents.season_id, seasonId),
                    eq(seasonEvents.event_type, eventType)
                )
            )
            .orderBy(asc(seasonEvents.event_date))
        const weekEvent = seasonEventsForType[nextMatchRow.week - 1]
        if (weekEvent) {
            matchEventId = weekEvent.id
            if (!matchDate) {
                matchDate = weekEvent.eventDate
            }
        }

        if (!matchDate) return null

        const opponentTeamId =
            nextMatchRow.homeTeamId === draftRecord.teamId
                ? nextMatchRow.awayTeamId
                : nextMatchRow.homeTeamId

        if (opponentTeamId === null) return null

        const [opponent, divisionRow] = await Promise.all([
            resolveOpponentName(opponentTeamId),
            db
                .select({ name: divisions.name })
                .from(divisions)
                .where(eq(divisions.id, nextMatchRow.divisionId))
                .limit(1)
        ])

        if (!opponent) return null

        // Check if player has marked themselves unavailable for this match's event
        let isUnavailable = false
        if (matchEventId !== null) {
            const [signup] = await db
                .select({ id: signups.id })
                .from(signups)
                .where(
                    and(
                        eq(signups.player, userId),
                        eq(signups.season, seasonId)
                    )
                )
                .limit(1)

            if (signup) {
                const [unavailRecord] = await db
                    .select({ id: userUnavailability.id })
                    .from(userUnavailability)
                    .where(
                        and(
                            eq(userUnavailability.signup_id, signup.id),
                            eq(userUnavailability.event_id, matchEventId)
                        )
                    )
                    .limit(1)
                isUnavailable = !!unavailRecord
            }
        }

        return {
            date: matchDate,
            time: formatMatchTime(nextMatchRow.time),
            court: nextMatchRow.court,
            opponentName: opponent.name,
            divisionName: divisionRow[0]?.name ?? "",
            week: nextMatchRow.week,
            isUnavailable
        }
    } catch (error) {
        console.error("Error fetching next match:", error)
        return null
    }
}

/**
 * Most recent scored match for the user's team this season, playoffs first
 * (playoff week numbering restarts, so the flag outranks the week). No authz.
 */
export async function getLastMatchResultForUser(
    userId: string,
    seasonId: number
): Promise<LastMatchResult | null> {
    try {
        const draftRecord = await findTeamForUser(userId, seasonId)
        if (!draftRecord) return null

        const [lastMatchRow] = await db
            .select({
                date: matches.date,
                week: matches.week,
                playoff: matches.playoff,
                homeTeamId: matches.home_team,
                awayTeamId: matches.away_team,
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
            .where(
                and(
                    eq(matches.season, seasonId),
                    or(
                        isNotNull(matches.home_score),
                        isNotNull(matches.home_set1_score)
                    ),
                    or(
                        eq(matches.home_team, draftRecord.teamId),
                        eq(matches.away_team, draftRecord.teamId)
                    )
                )
            )
            .orderBy(
                desc(matches.playoff),
                desc(matches.week),
                desc(matches.id)
            )
            .limit(1)

        if (!lastMatchRow) return null

        const isHome = lastMatchRow.homeTeamId === draftRecord.teamId
        const opponentTeamId = isHome
            ? lastMatchRow.awayTeamId
            : lastMatchRow.homeTeamId
        if (opponentTeamId === null) return null

        const opponent = await resolveOpponentName(opponentTeamId)
        if (!opponent) return null

        // Games won per side: count sets when set scores exist, else fall back
        // to the legacy game-count columns (same derivation as season-schedule).
        const setScores = getSetScores(lastMatchRow)
        let homeGames = 0
        let awayGames = 0
        for (const set of setScores) {
            if (set.home > set.away) homeGames++
            else if (set.away > set.home) awayGames++
        }
        if (setScores.length === 0) {
            homeGames = lastMatchRow.homeScore ?? 0
            awayGames = lastMatchRow.awayScore ?? 0
        }

        const myGames = isHome ? homeGames : awayGames
        const oppGames = isHome ? awayGames : homeGames
        // Season-schedule convention: home wins ties (shouldn't occur in play)
        const homeWinsMatch = homeGames >= awayGames

        // Resolve the date like the next-match card: explicit date, else the
        // week-th season event of the matching type.
        let matchDate: string | null = lastMatchRow.date
        if (!matchDate) {
            const eventType = lastMatchRow.playoff
                ? "playoff"
                : "regular_season"
            const seasonEventsForType = await db
                .select({ eventDate: seasonEvents.event_date })
                .from(seasonEvents)
                .where(
                    and(
                        eq(seasonEvents.season_id, seasonId),
                        eq(seasonEvents.event_type, eventType)
                    )
                )
                .orderBy(asc(seasonEvents.event_date))
            matchDate =
                seasonEventsForType[lastMatchRow.week - 1]?.eventDate ?? null
        }

        return {
            won: isHome ? homeWinsMatch : !homeWinsMatch,
            myGames,
            oppGames,
            opponentName: opponent.name,
            week: lastMatchRow.week,
            date: matchDate
        }
    } catch (error) {
        console.error("Error fetching last match result:", error)
        return null
    }
}
