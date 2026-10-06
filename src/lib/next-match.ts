/**
 * next-match.ts — schedule lookups for a single player in a season.
 *
 * These helpers perform NO authorization checks: callers must gate access
 * (e.g. self-only, admin, or friendship) before invoking them.
 */

import { logger } from "@/lib/logger"
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
import { eq, and, or, asc, inArray } from "drizzle-orm"
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
    /** Sortable `YYYY-MM-DDTHH:MM:SS`; `time` is display-formatted. */
    sortKey: string
}

export interface LastMatchResult {
    won: boolean
    myGames: number
    oppGames: number
    opponentName: string
    week: number
    date: string | null
}

type MatchRow = {
    id: number
    date: string | null
    time: string | null
    court: number | null
    week: number
    playoff: boolean
    homeTeamId: number | null
    awayTeamId: number | null
    divisionId: number
    homeScore: number | null
    awayScore: number | null
    home_set1_score: number | null
    away_set1_score: number | null
    home_set2_score: number | null
    away_set2_score: number | null
    home_set3_score: number | null
    away_set3_score: number | null
}

/**
 * Everything the next-match and last-result lookups need for a set of
 * players, in a fixed number of queries however many players there are.
 * The friends list and dashboard card used to run each lookup per friend
 * (around a dozen round trips each), which made one page load cost
 * hundreds of queries.
 */
async function loadScheduleContext(userIds: string[], seasonId: number) {
    const teamRows = await db
        .select({ userId: drafts.user, teamId: teams.id })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .where(and(inArray(drafts.user, userIds), eq(teams.season, seasonId)))
    const teamByUser = new Map<string, number>()
    for (const row of teamRows) {
        if (!teamByUser.has(row.userId)) teamByUser.set(row.userId, row.teamId)
    }
    const teamIds = [...new Set(teamByUser.values())]
    if (teamIds.length === 0) return null

    const [matchRows, eventRows, signupRows] = await Promise.all([
        db
            .select({
                id: matches.id,
                date: matches.date,
                time: matches.time,
                court: matches.court,
                week: matches.week,
                playoff: matches.playoff,
                homeTeamId: matches.home_team,
                awayTeamId: matches.away_team,
                divisionId: matches.division,
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
                        inArray(matches.home_team, teamIds),
                        inArray(matches.away_team, teamIds)
                    )
                )
            ),
        db
            .select({
                id: seasonEvents.id,
                eventDate: seasonEvents.event_date,
                eventType: seasonEvents.event_type
            })
            .from(seasonEvents)
            .where(
                and(
                    eq(seasonEvents.season_id, seasonId),
                    inArray(seasonEvents.event_type, [
                        "regular_season",
                        "playoff"
                    ])
                )
            )
            .orderBy(asc(seasonEvents.event_date)),
        db
            .select({ player: signups.player, id: signups.id })
            .from(signups)
            .where(
                and(
                    inArray(signups.player, userIds),
                    eq(signups.season, seasonId)
                )
            )
    ])

    const opponentIds = [
        ...new Set(matchRows.flatMap((m) => [m.homeTeamId, m.awayTeamId]))
    ].filter((id): id is number => id !== null)
    const divisionIds = [...new Set(matchRows.map((m) => m.divisionId))]
    const signupIds = signupRows.map((r) => r.id)

    const [opponentRows, divisionRows, unavailableRows] = await Promise.all([
        opponentIds.length > 0
            ? db
                  .select({
                      id: teams.id,
                      number: teams.number,
                      name: teams.name,
                      divisionId: teams.division
                  })
                  .from(teams)
                  .where(inArray(teams.id, opponentIds))
            : [],
        divisionIds.length > 0
            ? db
                  .select({ id: divisions.id, name: divisions.name })
                  .from(divisions)
                  .where(inArray(divisions.id, divisionIds))
            : [],
        signupIds.length > 0
            ? db
                  .select({
                      signupId: userUnavailability.signup_id,
                      eventId: userUnavailability.event_id
                  })
                  .from(userUnavailability)
                  .where(inArray(userUnavailability.signup_id, signupIds))
            : []
    ])

    // Real team names stay hidden until the opponent's division has drafted
    // this season (the season schedule pages use the same rule).
    const opponentDivisionIds = [
        ...new Set(opponentRows.map((t) => t.divisionId))
    ]
    const draftedRows =
        opponentDivisionIds.length > 0
            ? await db
                  .selectDistinct({ divisionId: teams.division })
                  .from(drafts)
                  .innerJoin(teams, eq(drafts.team, teams.id))
                  .where(
                      and(
                          eq(teams.season, seasonId),
                          inArray(teams.division, opponentDivisionIds)
                      )
                  )
            : []
    const draftedDivisions = new Set(draftedRows.map((r) => r.divisionId))

    const signupByUser = new Map(signupRows.map((r) => [r.player, r.id]))
    return {
        teamByUser,
        matchRows: matchRows as MatchRow[],
        eventsByType: {
            regular_season: eventRows.filter(
                (e) => e.eventType === "regular_season"
            ),
            playoff: eventRows.filter((e) => e.eventType === "playoff")
        },
        teamsById: new Map(opponentRows.map((t) => [t.id, t])),
        draftedDivisions,
        divisionNames: new Map(divisionRows.map((d) => [d.id, d.name])),
        signupByUser,
        unavailable: new Set(
            unavailableRows.map((r) => `${r.signupId}:${r.eventId}`)
        )
    }
}

type ScheduleContext = NonNullable<
    Awaited<ReturnType<typeof loadScheduleContext>>
>

function opponentName(ctx: ScheduleContext, teamId: number): string | null {
    const team = ctx.teamsById.get(teamId)
    if (!team) return null
    if (ctx.draftedDivisions.has(team.divisionId)) return team.name
    return team.number !== null ? `Team ${team.number}` : team.name
}

/** The week-th season event of the match's type (playoff or regular). */
function weekEvent(ctx: ScheduleContext, match: MatchRow) {
    const events = match.playoff
        ? ctx.eventsByType.playoff
        : ctx.eventsByType.regular_season
    return events[match.week - 1] ?? null
}

function isScored(match: MatchRow): boolean {
    return match.homeScore !== null || match.home_set1_score !== null
}

function involves(match: MatchRow, teamId: number): boolean {
    return match.homeTeamId === teamId || match.awayTeamId === teamId
}

function buildNextMatch(
    ctx: ScheduleContext,
    userId: string
): NextMatch | null {
    const teamId = ctx.teamByUser.get(userId)
    if (teamId === undefined) return null

    // Earliest unplayed match: by week, then time (no time sorts last).
    const next = ctx.matchRows
        .filter((m) => involves(m, teamId) && !isScored(m))
        .sort(
            (a, b) =>
                a.week - b.week ||
                (a.time ?? "\uffff").localeCompare(b.time ?? "\uffff")
        )[0]
    if (!next) return null

    // Availability is stored against season events, so the week's event is
    // needed even when the match carries its own date.
    const event = weekEvent(ctx, next)
    const matchDate = next.date ?? event?.eventDate ?? null
    if (!matchDate) return null

    const opponentId =
        next.homeTeamId === teamId ? next.awayTeamId : next.homeTeamId
    if (opponentId === null) return null
    const opponent = opponentName(ctx, opponentId)
    if (opponent === null) return null

    const signupId = ctx.signupByUser.get(userId)
    const isUnavailable =
        event !== null &&
        signupId !== undefined &&
        ctx.unavailable.has(`${signupId}:${event.id}`)

    return {
        date: matchDate,
        time: formatMatchTime(next.time),
        court: next.court,
        opponentName: opponent,
        divisionName: ctx.divisionNames.get(next.divisionId) ?? "",
        week: next.week,
        isUnavailable,
        sortKey: `${matchDate}T${next.time ?? "00:00:00"}`
    }
}

function buildLastResult(
    ctx: ScheduleContext,
    userId: string
): LastMatchResult | null {
    const teamId = ctx.teamByUser.get(userId)
    if (teamId === undefined) return null

    // Playoffs first (playoff week numbering restarts, so the flag outranks
    // the week), then the latest week.
    const last = ctx.matchRows
        .filter((m) => involves(m, teamId) && isScored(m))
        .sort(
            (a, b) =>
                Number(b.playoff) - Number(a.playoff) ||
                b.week - a.week ||
                b.id - a.id
        )[0]
    if (!last) return null

    const isHome = last.homeTeamId === teamId
    const opponentId = isHome ? last.awayTeamId : last.homeTeamId
    if (opponentId === null) return null
    const opponent = opponentName(ctx, opponentId)
    if (opponent === null) return null

    // Games won per side: count sets when set scores exist, else fall back
    // to the legacy game-count columns (same derivation as season-schedule).
    const setScores = getSetScores(last)
    let homeGames = 0
    let awayGames = 0
    for (const set of setScores) {
        if (set.home > set.away) homeGames++
        else if (set.away > set.home) awayGames++
    }
    if (setScores.length === 0) {
        homeGames = last.homeScore ?? 0
        awayGames = last.awayScore ?? 0
    }
    // Season-schedule convention: home wins ties (shouldn't occur in play)
    const homeWinsMatch = homeGames >= awayGames

    return {
        won: isHome ? homeWinsMatch : !homeWinsMatch,
        myGames: isHome ? homeGames : awayGames,
        oppGames: isHome ? awayGames : homeGames,
        opponentName: opponent,
        week: last.week,
        date: last.date ?? weekEvent(ctx, last)?.eventDate ?? null
    }
}

/**
 * Next unplayed match and last result for each player this season, keyed by
 * user id (null when a player has no team or nothing to show). No authz.
 */
export async function getScheduleSummaries(
    userIds: readonly string[],
    seasonId: number
): Promise<
    Map<
        string,
        { nextMatch: NextMatch | null; lastResult: LastMatchResult | null }
    >
> {
    const result = new Map<
        string,
        { nextMatch: NextMatch | null; lastResult: LastMatchResult | null }
    >()
    const unique = [...new Set(userIds)]
    for (const id of unique)
        result.set(id, { nextMatch: null, lastResult: null })
    if (unique.length === 0) return result

    try {
        const ctx = await loadScheduleContext(unique, seasonId)
        if (!ctx) return result
        for (const id of unique) {
            result.set(id, {
                nextMatch: buildNextMatch(ctx, id),
                lastResult: buildLastResult(ctx, id)
            })
        }
    } catch (error) {
        logger.error("Error fetching schedule summaries", undefined, error)
    }
    return result
}

/** Next unplayed match for the user's team this season. No authz. */
export async function getNextMatchForUser(
    userId: string,
    seasonId: number
): Promise<NextMatch | null> {
    const summaries = await getScheduleSummaries([userId], seasonId)
    return summaries.get(userId)?.nextMatch ?? null
}

/**
 * Most recent scored match for the user's team this season, playoffs first
 * (playoff week numbering restarts, so the flag outranks the week). No authz.
 */
export async function getLastMatchResultForUser(
    userId: string,
    seasonId: number
): Promise<LastMatchResult | null> {
    const summaries = await getScheduleSummaries([userId], seasonId)
    return summaries.get(userId)?.lastResult ?? null
}
