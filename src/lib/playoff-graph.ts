/**
 * playoff-graph.ts — one division's playoff bracket as a PlayoffNode graph,
 * plus where and when each bracket match is played. Shared by the dashboard's
 * playoff next-match card and the day-before game reminder, so both tell a
 * team the same conditional "if you win match 1…" story.
 *
 * Performs NO authorization checks: callers must gate access.
 */

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import {
    individual_divisions,
    matches,
    playoffMatchesMeta,
    teams
} from "@/database/schema"
import {
    parseSourceToken,
    type PlayoffNode,
    type ResolutionContext
} from "@/lib/playoff-resolution"
import { FOUR_TEAM_PLAYOFF, SIX_TEAM_PLAYOFF } from "@/lib/schedule-constants"

export interface PlayoffMatchSlot {
    matchId: number
    /** "" until the playoff night is configured. */
    date: string | null
    time: string | null
    court: number | null
}

export interface PlayoffDivisionGraph {
    ctx: ResolutionContext
    /** "#3 Name", or the bare name for an unnumbered team. */
    teamLabelById: Map<number, string>
    /** Keyed by match number; absent when the meta row has no match yet. */
    slotByMatchNum: Map<number, PlayoffMatchSlot>
}

export function decideMatchOutcome(row: {
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

export async function loadPlayoffDivisionGraph(
    seasonId: number,
    divisionId: number
): Promise<PlayoffDivisionGraph> {
    // Teams in this division, ordered by rank (rank=1 is the top seed).
    const divisionTeams = await db
        .select({
            id: teams.id,
            number: teams.number,
            name: teams.name,
            rank: teams.rank
        })
        .from(teams)
        .where(and(eq(teams.season, seasonId), eq(teams.division, divisionId)))

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

    const nodeByMatchNum = new Map<number, PlayoffNode>()
    const slotByMatchNum = new Map<number, PlayoffMatchSlot>()
    for (const meta of metaRows) {
        const m = meta.matchId !== null ? matchById.get(meta.matchId) : null
        const effectiveWorkSource =
            meta.workSource ?? workSourceByMatchNum.get(meta.matchNum) ?? null
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
        if (m) {
            slotByMatchNum.set(meta.matchNum, {
                matchId: m.id,
                date: m.date,
                time: m.time,
                court: m.court
            })
        }
    }

    return {
        ctx: { seedTeamIdByNumber, nodeByMatchNum, teamNumberById },
        teamLabelById,
        slotByMatchNum
    }
}
