"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    teams,
    drafts,
    divisions,
    individual_divisions,
    matches,
    seasonEvents,
    signups,
    userUnavailability,
    playoffMatchesMeta
} from "@/database/schema"
import { eq, and, inArray, asc, or, isNull } from "drizzle-orm"
import {
    parseSourceToken,
    sourceContainsTeam,
    resolveOpponentLabel,
    type ParsedSource,
    type PlayoffNode,
    type ResolutionContext
} from "@/lib/playoff-resolution"
import {
    FOUR_TEAM_PLAYOFF,
    SIX_TEAM_PLAYOFF
} from "@/app/dashboard/create-schedule/schedule-constants"
import {
    isAdminOrDirectorBySession,
    isCommissionerBySession,
    hasCaptainPagesAccessBySession
} from "@/lib/rbac"
import { formatMatchTime } from "@/lib/season-utils"

export interface NextMatch {
    date: string
    time: string | null
    court: number | null
    opponentName: string
    divisionName: string
    week: number
    isUnavailable: boolean
}

export async function getNextMatch(
    userId: string,
    seasonId: number
): Promise<NextMatch | null> {
    try {
        const session = await auth.api.getSession({ headers: await headers() })
        if (!session) return null
        if (session.user.id !== userId) {
            const allowed =
                (await isAdminOrDirectorBySession()) ||
                (await isCommissionerBySession()) ||
                (await hasCaptainPagesAccessBySession())
            if (!allowed) return null
        }

        const [draftRecord] = await db
            .select({ teamId: teams.id, divisionId: teams.division })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(and(eq(drafts.user, userId), eq(teams.season, seasonId)))
            .limit(1)

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

        const [opponentTeam, divisionRow] = await Promise.all([
            db
                .select({
                    id: teams.id,
                    number: teams.number,
                    name: teams.name,
                    divisionId: teams.division
                })
                .from(teams)
                .where(eq(teams.id, opponentTeamId))
                .limit(1),
            db
                .select({ name: divisions.name })
                .from(divisions)
                .where(eq(divisions.id, nextMatchRow.divisionId))
                .limit(1)
        ])

        const opponent = opponentTeam[0]
        if (!opponent) return null

        // Check if opponent's division is drafted
        const [draftedCheck] = await db
            .select({ teamId: drafts.team })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(eq(teams.division, opponent.divisionId))
            .limit(1)

        const isDivisionDrafted = !!draftedCheck
        const opponentName = isDivisionDrafted
            ? opponent.name
            : opponent.number !== null
              ? `Team ${opponent.number}`
              : opponent.name

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
            opponentName,
            divisionName: divisionRow[0]?.name ?? "",
            week: nextMatchRow.week,
            isUnavailable
        }
    } catch (error) {
        console.error("Error fetching next match:", error)
        return null
    }
}

export interface PlayoffNextMatchItem {
    role: "play" | "work"
    matchNum: number
    week: number
    date: string | null
    time: string | null
    court: number | null
    opponentLabel: string | null
    isUnavailable: boolean
    condition: string | null
}

export interface PlayoffNextMatchData {
    week: number
    date: string | null
    divisionName: string
    items: PlayoffNextMatchItem[]
    // "upcoming": items describe a genuine future touchpoint.
    // "pending_results": the team's last playoff night has already passed but
    // its matches are unscored, so the next match cannot be determined yet.
    status: "upcoming" | "pending_results"
}

function decideMatchOutcome(row: {
    homeTeamId: number | null
    awayTeamId: number | null
    homeScore: number | null
    awayScore: number | null
    homeSet1: number | null
    awaySet1: number | null
    homeSet2: number | null
    awaySet2: number | null
    homeSet3: number | null
    awaySet3: number | null
    winnerTeamId: number | null
}): { winnerTeamId: number | null; loserTeamId: number | null } {
    if (row.homeTeamId === null || row.awayTeamId === null) {
        return { winnerTeamId: null, loserTeamId: null }
    }

    let winnerTeamId = row.winnerTeamId
    if (winnerTeamId === null) {
        let homeWins = row.homeScore
        let awayWins = row.awayScore
        if (homeWins === null || awayWins === null) {
            let h = 0
            let a = 0
            const sets: Array<[number | null, number | null]> = [
                [row.homeSet1, row.awaySet1],
                [row.homeSet2, row.awaySet2],
                [row.homeSet3, row.awaySet3]
            ]
            let played = 0
            for (const [hs, as] of sets) {
                if (hs === null || as === null) continue
                played++
                if (hs > as) h++
                else if (as > hs) a++
            }
            if (played > 0) {
                homeWins = h
                awayWins = a
            }
        }
        if (homeWins !== null && awayWins !== null) {
            if (homeWins > awayWins) winnerTeamId = row.homeTeamId
            else if (awayWins > homeWins) winnerTeamId = row.awayTeamId
        }
    }

    if (winnerTeamId === null) {
        return { winnerTeamId: null, loserTeamId: null }
    }
    const loserTeamId =
        winnerTeamId === row.homeTeamId ? row.awayTeamId : row.homeTeamId
    return { winnerTeamId, loserTeamId }
}

export async function getPlayoffNextMatches(
    userId: string,
    seasonId: number
): Promise<PlayoffNextMatchData | null> {
    try {
        const session = await auth.api.getSession({ headers: await headers() })
        if (!session) return null
        if (session.user.id !== userId) {
            const allowed =
                (await isAdminOrDirectorBySession()) ||
                (await isCommissionerBySession()) ||
                (await hasCaptainPagesAccessBySession())
            if (!allowed) return null
        }

        const [draftRecord] = await db
            .select({ teamId: teams.id, divisionId: teams.division })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(and(eq(drafts.user, userId), eq(teams.season, seasonId)))
            .limit(1)
        if (!draftRecord) return null

        const teamId = draftRecord.teamId
        const divisionId = draftRecord.divisionId

        // Teams in this division, ordered by rank (rank=1 is the top seed).
        const divisionTeams = await db
            .select({
                id: teams.id,
                number: teams.number,
                name: teams.name,
                rank: teams.rank
            })
            .from(teams)
            .where(
                and(eq(teams.season, seasonId), eq(teams.division, divisionId))
            )

        const seedTeamIdByNumber = new Map<number, number>()
        for (const t of divisionTeams) {
            if (t.rank !== null) seedTeamIdByNumber.set(t.rank, t.id)
        }
        const teamLabelById = new Map<number, string>()
        const teamNumberById = new Map<number, number>()
        for (const t of divisionTeams) {
            teamLabelById.set(
                t.id,
                t.number !== null ? `#${t.number} ${t.name}` : t.name
            )
            if (t.number !== null) teamNumberById.set(t.id, t.number)
        }

        const [indivDivRow] = await db
            .select({ teamCount: individual_divisions.teams })
            .from(individual_divisions)
            .where(
                and(
                    eq(individual_divisions.season, seasonId),
                    eq(individual_divisions.division, divisionId)
                )
            )
            .limit(1)
        const teamCount = indivDivRow?.teamCount ?? null
        const template =
            teamCount === 4
                ? FOUR_TEAM_PLAYOFF
                : teamCount === 6
                  ? SIX_TEAM_PLAYOFF
                  : null
        const workSourceByMatchNum = new Map<number, string | null>(
            template?.map((t) => [t.matchNum, t.workTeam]) ?? []
        )

        // All playoff matches + their meta for this division.
        const metaRows = await db
            .select({
                matchId: playoffMatchesMeta.match_id,
                matchNum: playoffMatchesMeta.match_num,
                week: playoffMatchesMeta.week,
                homeSource: playoffMatchesMeta.home_source,
                awaySource: playoffMatchesMeta.away_source,
                workSource: playoffMatchesMeta.work_source,
                workTeamId: playoffMatchesMeta.work_team
            })
            .from(playoffMatchesMeta)
            .where(
                and(
                    eq(playoffMatchesMeta.season, seasonId),
                    eq(playoffMatchesMeta.division, divisionId)
                )
            )

        const matchIds = metaRows
            .map((r) => r.matchId)
            .filter((id): id is number => id !== null)
        const matchRows = matchIds.length
            ? await db
                  .select({
                      id: matches.id,
                      week: matches.week,
                      date: matches.date,
                      time: matches.time,
                      court: matches.court,
                      homeTeamId: matches.home_team,
                      awayTeamId: matches.away_team,
                      homeScore: matches.home_score,
                      awayScore: matches.away_score,
                      homeSet1: matches.home_set1_score,
                      awaySet1: matches.away_set1_score,
                      homeSet2: matches.home_set2_score,
                      awaySet2: matches.away_set2_score,
                      homeSet3: matches.home_set3_score,
                      awaySet3: matches.away_set3_score,
                      winnerTeamId: matches.winner
                  })
                  .from(matches)
                  .where(inArray(matches.id, matchIds))
            : []
        const matchById = new Map(matchRows.map((m) => [m.id, m]))

        // Build PlayoffNode graph keyed by matchNum.
        const nodeByMatchNum = new Map<number, PlayoffNode>()
        for (const meta of metaRows) {
            const m = meta.matchId !== null ? matchById.get(meta.matchId) : null
            const effectiveWorkSource =
                meta.workSource ??
                workSourceByMatchNum.get(meta.matchNum) ??
                null
            const outcome = m
                ? decideMatchOutcome(m)
                : { winnerTeamId: null, loserTeamId: null }
            nodeByMatchNum.set(meta.matchNum, {
                matchNum: meta.matchNum,
                week: meta.week,
                homeSource: parseSourceToken(meta.homeSource),
                awaySource: parseSourceToken(meta.awaySource),
                workSource: parseSourceToken(effectiveWorkSource),
                homeTeamId: m?.homeTeamId ?? null,
                awayTeamId: m?.awayTeamId ?? null,
                workTeamId: meta.workTeamId ?? null,
                winnerTeamId: outcome.winnerTeamId,
                loserTeamId: outcome.loserTeamId
            })
        }

        const ctx: ResolutionContext = {
            seedTeamIdByNumber,
            nodeByMatchNum,
            teamNumberById
        }

        // Determine target week: lowest week where the team has a possible
        // touchpoint AND at least one such match is unfinished.
        const matchInvolvement = new Map<
            number,
            {
                node: PlayoffNode
                playHome: ReturnType<typeof sourceContainsTeam>
                playAway: ReturnType<typeof sourceContainsTeam>
                work: ReturnType<typeof sourceContainsTeam>
                isFinished: boolean
            }
        >()
        for (const node of nodeByMatchNum.values()) {
            const m =
                metaRows.find((r) => r.matchNum === node.matchNum)?.matchId !==
                null
                    ? (matchRows.find(
                          (mr) =>
                              mr.id ===
                              metaRows.find((r) => r.matchNum === node.matchNum)
                                  ?.matchId
                      ) ?? null)
                    : null
            const isFinished = node.winnerTeamId !== null
            const playHome = sourceContainsTeam(node.homeSource, teamId, ctx)
            const playAway = sourceContainsTeam(node.awaySource, teamId, ctx)
            const work = sourceContainsTeam(node.workSource, teamId, ctx)
            void m
            matchInvolvement.set(node.matchNum, {
                node,
                playHome,
                playAway,
                work,
                isFinished
            })
        }

        const weeks = [
            ...new Set([...matchInvolvement.values()].map((mi) => mi.node.week))
        ].sort((a, b) => a - b)
        let targetWeek: number | null = null
        for (const w of weeks) {
            const involvedInWeek = [...matchInvolvement.values()].filter(
                (mi) =>
                    mi.node.week === w &&
                    (mi.playHome.contains ||
                        mi.playAway.contains ||
                        mi.work.contains)
            )
            if (involvedInWeek.length === 0) continue
            const anyUnfinished = involvedInWeek.some((mi) => !mi.isFinished)
            if (anyUnfinished) {
                targetWeek = w
                break
            }
        }
        if (targetWeek === null) return null

        // Resolve playoff event date for the target week.
        const seasonEventsForType = await db
            .select({
                eventDate: seasonEvents.event_date,
                id: seasonEvents.id
            })
            .from(seasonEvents)
            .where(
                and(
                    eq(seasonEvents.season_id, seasonId),
                    eq(seasonEvents.event_type, "playoff")
                )
            )
            .orderBy(asc(seasonEvents.event_date))
        const weekEvent = seasonEventsForType[targetWeek - 1]
        const targetWeekDate = weekEvent?.eventDate ?? null
        const targetWeekEventId = weekEvent?.id ?? null

        // Look up signup for unavailability checks.
        let isUnavailable = false
        if (targetWeekEventId !== null) {
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
                            eq(userUnavailability.event_id, targetWeekEventId)
                        )
                    )
                    .limit(1)
                isUnavailable = !!unavailRecord
            }
        }

        const items: PlayoffNextMatchItem[] = []
        const formatCondition = (
            playOrWork: { contains: boolean; condition: string | null } | null,
            sideCondition?: string | null
        ): string | null => {
            const c = playOrWork?.condition ?? null
            if (c) return c
            return sideCondition ?? null
        }
        for (const mi of matchInvolvement.values()) {
            if (mi.node.week !== targetWeek) continue
            if (mi.isFinished) continue

            const matchRow = (() => {
                const meta = metaRows.find(
                    (r) => r.matchNum === mi.node.matchNum
                )
                return meta?.matchId
                    ? (matchById.get(meta.matchId) ?? null)
                    : null
            })()
            const date = matchRow?.date ?? targetWeekDate
            const time = matchRow?.time ?? null
            const court = matchRow?.court ?? null

            // Play row: home or away resolves to team.
            if (mi.playHome.contains || mi.playAway.contains) {
                const teamSide = mi.playHome.contains ? "home" : "away"
                const otherSource: ParsedSource =
                    teamSide === "home"
                        ? mi.node.awaySource
                        : mi.node.homeSource
                const opponentLabel = resolveOpponentLabel(
                    otherSource,
                    ctx,
                    teamLabelById
                )
                items.push({
                    role: "play",
                    matchNum: mi.node.matchNum,
                    week: mi.node.week,
                    date,
                    time: formatMatchTime(time),
                    court,
                    opponentLabel,
                    isUnavailable,
                    condition: formatCondition(
                        teamSide === "home" ? mi.playHome : mi.playAway
                    )
                })
            }

            // Work row.
            if (mi.work.contains) {
                items.push({
                    role: "work",
                    matchNum: mi.node.matchNum,
                    week: mi.node.week,
                    date,
                    time: formatMatchTime(time),
                    court,
                    opponentLabel: null,
                    isUnavailable: false,
                    condition: formatCondition(mi.work)
                })
            }
        }

        items.sort((a, b) => {
            if (a.matchNum !== b.matchNum) return a.matchNum - b.matchNum
            if (a.role !== b.role) return a.role === "play" ? -1 : 1
            return 0
        })

        const [divisionRow] = await db
            .select({ name: divisions.name })
            .from(divisions)
            .where(eq(divisions.id, divisionId))
            .limit(1)

        // If the target playoff night has already passed but its matches are
        // still unscored, the team's outcome — and therefore its next match —
        // can't be known yet. Surface a "results pending" state instead of
        // presenting last night's matches as the upcoming one. Once scores are
        // entered the target week advances (or the card drops out entirely for
        // an eliminated team).
        const todayStr = new Date().toLocaleDateString("en-CA", {
            timeZone: "America/New_York"
        })
        const itemDates = items
            .map((it) => it.date)
            .filter((d): d is string => d !== null)
            .sort()
        const targetNightDate =
            targetWeekDate ?? itemDates[itemDates.length - 1] ?? null
        const status: PlayoffNextMatchData["status"] =
            targetNightDate !== null && targetNightDate < todayStr
                ? "pending_results"
                : "upcoming"

        return {
            week: targetWeek,
            date: targetWeekDate,
            divisionName: divisionRow?.name ?? "",
            items,
            status
        }
    } catch (error) {
        console.error("Error fetching playoff next matches:", error)
        return null
    }
}
