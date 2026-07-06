"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { withAction, ok, fail } from "@/lib/action-helpers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { and, asc, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import {
    matches,
    matchReferees,
    playoffMatchesMeta,
    drafts,
    teams,
    divisions,
    individual_divisions,
    scoreSheets
} from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import { hasPermissionBySession } from "@/lib/rbac"
import {
    createPlayerPictureUploadPresignedUrl,
    deleteR2Object,
    PLAYER_PICTURE_MAX_BYTES
} from "@/lib/r2"
import { logAuditEntry } from "@/lib/audit-log"
import { parseSourceToken } from "@/lib/playoff-sources"

async function getEnterScoresSeasonId(): Promise<number | null> {
    const config = await getSeasonConfig()
    return config.seasonId || null
}

export interface MatchDateOption {
    date: string
    label: string
    isPlayoff: boolean
}

export async function getMatchDatesForSeason(): Promise<{
    status: boolean
    message?: string
    dates: MatchDateOption[]
}> {
    const seasonId = await getEnterScoresSeasonId()
    const hasAccess = seasonId
        ? await hasPermissionBySession("scores:enter", { seasonId })
        : false
    if (!hasAccess || !seasonId) {
        return { status: false, message: "Unauthorized", dates: [] }
    }

    try {
        const rows = await db
            .select({
                date: matches.date,
                playoff: matches.playoff
            })
            .from(matches)
            .where(eq(matches.season, seasonId))
            .orderBy(asc(matches.date))

        const dateMap = new Map<string, boolean>()
        for (const row of rows) {
            if (!row.date) continue
            const existing = dateMap.get(row.date)
            // If any match on this date is a playoff match, mark as playoff
            if (existing === undefined) {
                dateMap.set(row.date, row.playoff)
            } else if (row.playoff) {
                dateMap.set(row.date, true)
            }
        }

        const dates: MatchDateOption[] = []
        for (const [date, isPlayoff] of dateMap) {
            const [year, month, day] = date.split("-")
            const label = `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}${isPlayoff ? " (Playoffs)" : ""}`
            dates.push({ date, label, isPlayoff })
        }

        return { status: true, dates }
    } catch (error) {
        console.error("Error fetching match dates:", error)
        return {
            status: false,
            message: "Failed to load match dates.",
            dates: []
        }
    }
}

export interface MatchScoreData {
    matchId: number
    time: string | null
    court: number | null
    homeTeamId: number | null
    homeTeamName: string
    awayTeamId: number | null
    awayTeamName: string
    homeScore: number | null
    awayScore: number | null
    homeSet1Score: number | null
    awaySet1Score: number | null
    homeSet2Score: number | null
    awaySet2Score: number | null
    homeSet3Score: number | null
    awaySet3Score: number | null
    winner: number | null
    playoff: boolean
    playoffMatchNum: number | null
    homeSource: string | null
    awaySource: string | null
}

export interface DivisionMatchGroup {
    divisionId: number
    divisionName: string
    matches: MatchScoreData[]
    seedToTeamId: Record<number, number>
    teamNameById: Record<number, string>
}

export interface ScoreSheetData {
    id: number
    divisionId: number
    imagePath: string
}

export async function getMatchesForDate(date: string): Promise<{
    status: boolean
    message?: string
    divisions: DivisionMatchGroup[]
    scoreSheets: ScoreSheetData[]
}> {
    const seasonId = await getEnterScoresSeasonId()
    const hasAccess = seasonId
        ? await hasPermissionBySession("scores:enter", { seasonId })
        : false
    if (!hasAccess || !seasonId) {
        return {
            status: false,
            message: "Unauthorized",
            divisions: [],
            scoreSheets: []
        }
    }

    try {
        // Get divisions active for this season
        const seasonDivisions = await db
            .select({
                divisionId: divisions.id,
                divisionName: divisions.name,
                level: divisions.level
            })
            .from(individual_divisions)
            .innerJoin(
                divisions,
                eq(individual_divisions.division, divisions.id)
            )
            .where(eq(individual_divisions.season, seasonId))
            .orderBy(asc(divisions.level))

        const divisionIds = seasonDivisions.map((d) => d.divisionId)
        if (divisionIds.length === 0) {
            return { status: true, divisions: [], scoreSheets: [] }
        }

        // Get all teams for the season for name lookups
        const teamRows = await db
            .select({
                id: teams.id,
                name: teams.name,
                division: teams.division
            })
            .from(teams)
            .where(eq(teams.season, seasonId))

        const teamMap = new Map<number, { name: string; division: number }>()
        for (const t of teamRows) {
            teamMap.set(t.id, { name: t.name, division: t.division })
        }

        // Get matches for the date
        const matchRows = await db
            .select({
                id: matches.id,
                division: matches.division,
                time: matches.time,
                court: matches.court,
                homeTeam: matches.home_team,
                awayTeam: matches.away_team,
                homeScore: matches.home_score,
                awayScore: matches.away_score,
                homeSet1Score: matches.home_set1_score,
                awaySet1Score: matches.away_set1_score,
                homeSet2Score: matches.home_set2_score,
                awaySet2Score: matches.away_set2_score,
                homeSet3Score: matches.home_set3_score,
                awaySet3Score: matches.away_set3_score,
                winner: matches.winner,
                playoff: matches.playoff
            })
            .from(matches)
            .where(and(eq(matches.season, seasonId), eq(matches.date, date)))
            .orderBy(asc(matches.time), asc(matches.court))

        // Look up playoff meta for any playoff matches on this date so the
        // client can lock TBD slots and resolve them live as winners are
        // selected for earlier matches on the same page.
        const playoffMatchIds = matchRows
            .filter((r) => r.playoff)
            .map((r) => r.id)
        const visibleDivisionIds = Array.from(
            new Set(matchRows.map((r) => r.division))
        )

        const metaByMatchId = new Map<
            number,
            { matchNum: number; homeSource: string; awaySource: string }
        >()
        const seedToTeamIdByDivision = new Map<number, Map<number, number>>()

        if (playoffMatchIds.length > 0 && visibleDivisionIds.length > 0) {
            const metaRowsForDate = await db
                .select({
                    matchId: playoffMatchesMeta.match_id,
                    matchNum: playoffMatchesMeta.match_num,
                    homeSource: playoffMatchesMeta.home_source,
                    awaySource: playoffMatchesMeta.away_source
                })
                .from(playoffMatchesMeta)
                .where(
                    and(
                        eq(playoffMatchesMeta.season, seasonId),
                        inArray(playoffMatchesMeta.match_id, playoffMatchIds)
                    )
                )

            for (const m of metaRowsForDate) {
                if (m.matchId === null) continue
                metaByMatchId.set(m.matchId, {
                    matchNum: m.matchNum,
                    homeSource: m.homeSource,
                    awaySource: m.awaySource
                })
            }

            // Build seedToTeamId per visible division by walking all meta rows
            // in that division and reading realized team ids for S* sources.
            const allDivMeta = await db
                .select({
                    division: playoffMatchesMeta.division,
                    matchId: playoffMatchesMeta.match_id,
                    homeSource: playoffMatchesMeta.home_source,
                    awaySource: playoffMatchesMeta.away_source
                })
                .from(playoffMatchesMeta)
                .where(
                    and(
                        eq(playoffMatchesMeta.season, seasonId),
                        inArray(playoffMatchesMeta.division, visibleDivisionIds)
                    )
                )

            const metaMatchIds = allDivMeta
                .map((m) => m.matchId)
                .filter((id): id is number => id !== null)

            const realizedTeamsById = new Map<
                number,
                { homeTeam: number | null; awayTeam: number | null }
            >()
            if (metaMatchIds.length > 0) {
                const realizedRows = await db
                    .select({
                        id: matches.id,
                        homeTeam: matches.home_team,
                        awayTeam: matches.away_team
                    })
                    .from(matches)
                    .where(inArray(matches.id, metaMatchIds))
                for (const r of realizedRows) {
                    realizedTeamsById.set(r.id, {
                        homeTeam: r.homeTeam,
                        awayTeam: r.awayTeam
                    })
                }
            }

            for (const m of allDivMeta) {
                if (m.matchId === null) continue
                const realized = realizedTeamsById.get(m.matchId)
                if (!realized) continue
                const home = parseSourceToken(m.homeSource)
                const away = parseSourceToken(m.awaySource)
                let seedMap = seedToTeamIdByDivision.get(m.division)
                if (!seedMap) {
                    seedMap = new Map<number, number>()
                    seedToTeamIdByDivision.set(m.division, seedMap)
                }
                if (
                    home.kind === "seed" &&
                    home.value !== null &&
                    realized.homeTeam !== null
                ) {
                    seedMap.set(home.value, realized.homeTeam)
                }
                if (
                    away.kind === "seed" &&
                    away.value !== null &&
                    realized.awayTeam !== null
                ) {
                    seedMap.set(away.value, realized.awayTeam)
                }
            }
        }

        // Group matches by division
        const divisionMap = new Map<number, MatchScoreData[]>()
        for (const row of matchRows) {
            const homeTeam = row.homeTeam ? teamMap.get(row.homeTeam) : null
            const awayTeam = row.awayTeam ? teamMap.get(row.awayTeam) : null
            const meta = metaByMatchId.get(row.id)

            const matchData: MatchScoreData = {
                matchId: row.id,
                time: row.time,
                court: row.court,
                homeTeamId: row.homeTeam,
                homeTeamName: homeTeam?.name ?? "TBD",
                awayTeamId: row.awayTeam,
                awayTeamName: awayTeam?.name ?? "TBD",
                homeScore: row.homeScore,
                awayScore: row.awayScore,
                homeSet1Score: row.homeSet1Score,
                awaySet1Score: row.awaySet1Score,
                homeSet2Score: row.homeSet2Score,
                awaySet2Score: row.awaySet2Score,
                homeSet3Score: row.homeSet3Score,
                awaySet3Score: row.awaySet3Score,
                winner: row.winner,
                playoff: row.playoff,
                playoffMatchNum: meta?.matchNum ?? null,
                homeSource: meta?.homeSource ?? null,
                awaySource: meta?.awaySource ?? null
            }

            const list = divisionMap.get(row.division) ?? []
            list.push(matchData)
            divisionMap.set(row.division, list)
        }

        const divisionGroups: DivisionMatchGroup[] = seasonDivisions
            .filter((d) => divisionMap.has(d.divisionId))
            .map((d) => {
                const seedMap = seedToTeamIdByDivision.get(d.divisionId)
                const seedToTeamId: Record<number, number> = {}
                if (seedMap) {
                    for (const [seed, teamId] of seedMap) {
                        seedToTeamId[seed] = teamId
                    }
                }
                const teamNameById: Record<number, string> = {}
                for (const [id, info] of teamMap) {
                    if (info.division === d.divisionId) {
                        teamNameById[id] = info.name
                    }
                }
                return {
                    divisionId: d.divisionId,
                    divisionName: d.divisionName,
                    matches: divisionMap.get(d.divisionId) ?? [],
                    seedToTeamId,
                    teamNameById
                }
            })

        // Get existing score sheets
        const sheetRows = await db
            .select({
                id: scoreSheets.id,
                divisionId: scoreSheets.division_id,
                imagePath: scoreSheets.image_path
            })
            .from(scoreSheets)
            .where(
                and(
                    eq(scoreSheets.season_id, seasonId),
                    eq(scoreSheets.match_date, date)
                )
            )

        const scoreSheetData: ScoreSheetData[] = sheetRows.map((s) => ({
            id: s.id,
            divisionId: s.divisionId,
            imagePath: s.imagePath
        }))

        return {
            status: true,
            divisions: divisionGroups,
            scoreSheets: scoreSheetData
        }
    } catch (error) {
        console.error("Error fetching matches for date:", error)
        return {
            status: false,
            message: "Failed to load matches.",
            divisions: [],
            scoreSheets: []
        }
    }
}

export interface MatchScoreInput {
    matchId: number
    homeScore: number | null
    awayScore: number | null
    homeSet1Score: number | null
    awaySet1Score: number | null
    homeSet2Score: number | null
    awaySet2Score: number | null
    homeSet3Score: number | null
    awaySet3Score: number | null
    winner: number | null
}

export async function saveScoresForDivision(
    divisionId: number,
    date: string,
    matchScores: MatchScoreInput[]
): Promise<{ status: boolean; message: string }> {
    const seasonId = await getEnterScoresSeasonId()
    const hasAccess = seasonId
        ? await hasPermissionBySession("scores:enter", { seasonId })
        : false
    if (!hasAccess || !seasonId) {
        return { status: false, message: "Unauthorized" }
    }

    if (!divisionId || divisionId <= 0) {
        return { status: false, message: "Invalid division." }
    }

    try {
        // Validate no negative scores
        for (const score of matchScores) {
            const scoreValues = [
                score.homeScore,
                score.awayScore,
                score.homeSet1Score,
                score.awaySet1Score,
                score.homeSet2Score,
                score.awaySet2Score,
                score.homeSet3Score,
                score.awaySet3Score
            ]
            for (const val of scoreValues) {
                if (val !== null && val < 0) {
                    return {
                        status: false,
                        message: "Scores cannot be negative."
                    }
                }
            }
        }

        // Validate that all match IDs belong to this season/division/date
        const matchIds = matchScores.map((m) => m.matchId)
        if (matchIds.length === 0) {
            return { status: false, message: "No matches to save." }
        }

        const validMatches = await db
            .select({
                id: matches.id,
                homeTeam: matches.home_team,
                awayTeam: matches.away_team
            })
            .from(matches)
            .where(
                and(
                    eq(matches.season, seasonId),
                    eq(matches.division, divisionId),
                    eq(matches.date, date),
                    inArray(matches.id, matchIds)
                )
            )

        const validMatchMap = new Map(
            validMatches.map((m) => [
                m.id,
                { homeTeam: m.homeTeam, awayTeam: m.awayTeam }
            ])
        )
        const invalidIds = matchIds.filter((id) => !validMatchMap.has(id))
        if (invalidIds.length > 0) {
            return {
                status: false,
                message: `Invalid match IDs: ${invalidIds.join(", ")}`
            }
        }

        // Validate winner is a participant in each match. For TBD playoff
        // matches with NULL team slots we defer this check until after the
        // cascade has filled in the dependent teams (re-validated inside the
        // transaction below).
        for (const score of matchScores) {
            if (score.winner !== null) {
                const match = validMatchMap.get(score.matchId)
                if (
                    match &&
                    match.homeTeam !== null &&
                    match.awayTeam !== null &&
                    score.winner !== match.homeTeam &&
                    score.winner !== match.awayTeam
                ) {
                    return {
                        status: false,
                        message: `Invalid winner for match ${score.matchId}.`
                    }
                }
            }
        }

        const autoPromotions: Array<{
            matchId: number
            previousPrimaryId: string
            promotedBackupId: string
        }> = []

        // Update all matches in a transaction, then realize any newly-resolvable
        // downstream playoff matches and auto-promote backup refs when the
        // primary ref's team becomes a participant.
        await db.transaction(async (tx) => {
            for (const score of matchScores) {
                await tx
                    .update(matches)
                    .set({
                        home_score: score.homeScore,
                        away_score: score.awayScore,
                        home_set1_score: score.homeSet1Score,
                        away_set1_score: score.awaySet1Score,
                        home_set2_score: score.homeSet2Score,
                        away_set2_score: score.awaySet2Score,
                        home_set3_score: score.homeSet3Score,
                        away_set3_score: score.awaySet3Score,
                        winner: score.winner
                    })
                    .where(eq(matches.id, score.matchId))
            }

            // Determine whether this save touched any playoff match in this
            // (season, division). If not, there is nothing downstream to
            // realize.
            const playoffMetaForUpdated = await tx
                .select({ matchId: playoffMatchesMeta.match_id })
                .from(playoffMatchesMeta)
                .where(
                    and(
                        eq(playoffMatchesMeta.season, seasonId),
                        eq(playoffMatchesMeta.division, divisionId),
                        inArray(playoffMatchesMeta.match_id, matchIds)
                    )
                )

            if (playoffMetaForUpdated.length === 0) return

            // Pull EVERY meta row in this (season, division) — not just the
            // weeks this save touched. Forward dependencies routinely cross
            // playoff weeks (e.g. week-2 slots are fed by week-1 W/L results),
            // so scoping to the saved weeks would leave later rounds with NULL
            // team slots and show them as permanently "locked / TBD" on the
            // Enter Scores page. realizeOnce only fills slots that are still
            // NULL, so widening the scope is safe and idempotent.
            const allMeta = await tx
                .select({
                    metaId: playoffMatchesMeta.id,
                    matchId: playoffMatchesMeta.match_id,
                    matchNum: playoffMatchesMeta.match_num,
                    week: playoffMatchesMeta.week,
                    homeSource: playoffMatchesMeta.home_source,
                    awaySource: playoffMatchesMeta.away_source
                })
                .from(playoffMatchesMeta)
                .where(
                    and(
                        eq(playoffMatchesMeta.season, seasonId),
                        eq(playoffMatchesMeta.division, divisionId)
                    )
                )

            const matchIdsForMeta = allMeta
                .map((m) => m.matchId)
                .filter((id): id is number => id !== null)

            type RealizedMatch = {
                id: number
                homeTeamId: number | null
                awayTeamId: number | null
                winner: number | null
            }

            const refreshRealized = async (): Promise<
                Map<number, RealizedMatch>
            > => {
                if (matchIdsForMeta.length === 0)
                    return new Map<number, RealizedMatch>()
                const rows = await tx
                    .select({
                        id: matches.id,
                        homeTeamId: matches.home_team,
                        awayTeamId: matches.away_team,
                        winner: matches.winner
                    })
                    .from(matches)
                    .where(inArray(matches.id, matchIdsForMeta))
                return new Map(rows.map((r) => [r.id, r]))
            }

            const matchNumToMatchId = new Map<number, number>()
            for (const m of allMeta) {
                if (m.matchId !== null) {
                    matchNumToMatchId.set(m.matchNum, m.matchId)
                }
            }

            const realizeOnce = async (): Promise<boolean> => {
                const realizedById = await refreshRealized()

                // Build winner / loser by matchNum from current realized state
                const winnerByMatchNum = new Map<number, number>()
                const loserByMatchNum = new Map<number, number>()
                for (const m of allMeta) {
                    if (m.matchId === null) continue
                    const r = realizedById.get(m.matchId)
                    if (r?.winner && r.homeTeamId && r.awayTeamId) {
                        winnerByMatchNum.set(m.matchNum, r.winner)
                        loserByMatchNum.set(
                            m.matchNum,
                            r.winner === r.homeTeamId
                                ? r.awayTeamId
                                : r.homeTeamId
                        )
                    }
                }

                let anyChange = false
                for (const m of allMeta) {
                    if (m.matchId === null) continue
                    const realized = realizedById.get(m.matchId)
                    if (!realized) continue

                    const home = parseSourceToken(m.homeSource)
                    const away = parseSourceToken(m.awaySource)

                    const resolveSide = (
                        src: ReturnType<typeof parseSourceToken>
                    ): number | null => {
                        if (src.kind === "winner" && src.value !== null) {
                            return winnerByMatchNum.get(src.value) ?? null
                        }
                        if (src.kind === "loser" && src.value !== null) {
                            return loserByMatchNum.get(src.value) ?? null
                        }
                        return null
                    }

                    const update: {
                        home_team?: number | null
                        away_team?: number | null
                    } = {}

                    // Derived sources (W#/L#) must re-sync whenever the
                    // upstream winner changes — including overwriting a
                    // slot that was previously filled with a now-stale
                    // team. Static sources (seed/team) are only filled
                    // when NULL so initial seeding is preserved.
                    const syncSide = (
                        src: ReturnType<typeof parseSourceToken>,
                        current: number | null
                    ): { changed: boolean; value: number | null } => {
                        if (src.kind === "winner" || src.kind === "loser") {
                            const v = resolveSide(src)
                            if (v !== current)
                                return { changed: true, value: v }
                            return { changed: false, value: current }
                        }
                        if (current === null) {
                            const v = resolveSide(src)
                            if (v !== null) return { changed: true, value: v }
                        }
                        return { changed: false, value: current }
                    }

                    const homeSync = syncSide(home, realized.homeTeamId)
                    const awaySync = syncSide(away, realized.awayTeamId)
                    if (homeSync.changed) update.home_team = homeSync.value
                    if (awaySync.changed) update.away_team = awaySync.value

                    if (Object.keys(update).length === 0) continue

                    await tx
                        .update(matches)
                        .set(update)
                        .where(eq(matches.id, m.matchId))
                    anyChange = true

                    // If participants actually changed (not just a first-time
                    // fill), any previously recorded winner/scores describe a
                    // different physical pairing — clear them so downstream
                    // rounds don't keep propagating stale advancement.
                    const homeReplaced =
                        homeSync.changed && realized.homeTeamId !== null
                    const awayReplaced =
                        awaySync.changed && realized.awayTeamId !== null
                    if (
                        (homeReplaced || awayReplaced) &&
                        realized.winner !== null
                    ) {
                        await tx
                            .update(matches)
                            .set({
                                winner: null,
                                home_score: null,
                                away_score: null,
                                home_set1_score: null,
                                away_set1_score: null,
                                home_set2_score: null,
                                away_set2_score: null,
                                home_set3_score: null,
                                away_set3_score: null
                            })
                            .where(eq(matches.id, m.matchId))
                    }

                    const newlySetTeamIds = new Set<number>()
                    if (
                        update.home_team !== undefined &&
                        update.home_team !== null
                    )
                        newlySetTeamIds.add(update.home_team)
                    if (
                        update.away_team !== undefined &&
                        update.away_team !== null
                    )
                        newlySetTeamIds.add(update.away_team)

                    // Auto-promote backup if primary ref is on one of the
                    // newly-set teams.
                    if (newlySetTeamIds.size === 0) continue

                    const refRows = await tx
                        .select({
                            id: matchReferees.id,
                            refereeId: matchReferees.referee_id,
                            role: matchReferees.role
                        })
                        .from(matchReferees)
                        .where(eq(matchReferees.match_id, m.matchId))

                    const primary = refRows.find((r) => r.role === "primary")
                    const backup = refRows.find((r) => r.role === "backup")
                    if (!primary || !backup) continue

                    // Find primary's team for this season — drafts first,
                    // then captain/captain2 of any team.
                    const primaryDraft = await tx
                        .select({ teamId: drafts.team })
                        .from(drafts)
                        .innerJoin(teams, eq(drafts.team, teams.id))
                        .where(
                            and(
                                eq(drafts.user, primary.refereeId),
                                eq(teams.season, seasonId)
                            )
                        )
                        .limit(1)

                    let primaryTeamId: number | null =
                        primaryDraft[0]?.teamId ?? null

                    if (primaryTeamId === null) {
                        const capRows = await tx
                            .select({
                                id: teams.id,
                                captain: teams.captain,
                                captain2: teams.captain2
                            })
                            .from(teams)
                            .where(eq(teams.season, seasonId))
                        for (const t of capRows) {
                            if (
                                t.captain === primary.refereeId ||
                                t.captain2 === primary.refereeId
                            ) {
                                primaryTeamId = t.id
                                break
                            }
                        }
                    }

                    if (
                        primaryTeamId !== null &&
                        newlySetTeamIds.has(primaryTeamId)
                    ) {
                        // Swap: delete current primary, promote backup → primary.
                        // The unique (match_id, role) index forces us to
                        // delete-then-update rather than swap in place.
                        await tx
                            .delete(matchReferees)
                            .where(eq(matchReferees.id, primary.id))
                        await tx
                            .update(matchReferees)
                            .set({ role: "primary" })
                            .where(eq(matchReferees.id, backup.id))

                        autoPromotions.push({
                            matchId: m.matchId,
                            previousPrimaryId: primary.refereeId,
                            promotedBackupId: backup.refereeId
                        })
                    }
                }
                return anyChange
            }

            // Cascade — keep realizing while progress is being made.
            for (let i = 0; i < 8; i++) {
                const changed = await realizeOnce()
                if (!changed) break
            }

            // Re-validate winners now that dependent teams have been resolved.
            // If a winner doesn't match either participating team, abort.
            const winnersToCheck = matchScores.filter((s) => s.winner !== null)
            if (winnersToCheck.length > 0) {
                const finalRows = await tx
                    .select({
                        id: matches.id,
                        homeTeam: matches.home_team,
                        awayTeam: matches.away_team
                    })
                    .from(matches)
                    .where(
                        inArray(
                            matches.id,
                            winnersToCheck.map((s) => s.matchId)
                        )
                    )
                const finalById = new Map(finalRows.map((r) => [r.id, r]))
                for (const score of winnersToCheck) {
                    const m = finalById.get(score.matchId)
                    if (!m) continue
                    if (
                        score.winner !== m.homeTeam &&
                        score.winner !== m.awayTeam
                    ) {
                        throw new Error(`INVALID_WINNER:${score.matchId}`)
                    }
                }
            }
        })

        const session = await auth.api.getSession({
            headers: await headers()
        })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "matches",
                entityId: String(divisionId),
                summary: `Entered scores for ${matchScores.length} match(es) in division ${divisionId} on ${date}`
            })

            for (const promo of autoPromotions) {
                await logAuditEntry({
                    userId: session.user.id,
                    action: "update",
                    entityType: "match_referees",
                    entityId: String(promo.matchId),
                    summary: `Auto-promoted backup ref ${promo.promotedBackupId} to primary on match ${promo.matchId} (replaced ${promo.previousPrimaryId} whose team is now a participant)`
                })
            }
        }

        revalidatePath("/dashboard/enter-scores")
        revalidatePath("/dashboard/season-schedule")
        revalidatePath("/dashboard/schedule-refs")
        revalidatePath("/dashboard/reffing-schedule")
        revalidatePath("/dashboard/playoffs", "layout")
        return {
            status: true,
            message: `Saved scores for ${matchScores.length} match(es).`
        }
    } catch (error) {
        console.error("Error saving scores:", error)
        if (
            error instanceof Error &&
            error.message.startsWith("INVALID_WINNER:")
        ) {
            const matchId = error.message.split(":")[1]
            return {
                status: false,
                message: `Invalid winner for match ${matchId} — the selected team isn't a participant.`
            }
        }
        return { status: false, message: "Failed to save scores." }
    }
}

const SCORE_SHEET_PREFIX = "scoresheets"

export async function createScoreSheetUpload(
    divisionId: number,
    date: string,
    contentLength: number
): Promise<{
    status: boolean
    message?: string
    uploadUrl?: string
    objectKey?: string
}> {
    const seasonId = await getEnterScoresSeasonId()
    const hasAccess = seasonId
        ? await hasPermissionBySession("scores:enter", { seasonId })
        : false
    if (!hasAccess || !seasonId) {
        return { status: false, message: "Unauthorized" }
    }

    if (
        !Number.isInteger(contentLength) ||
        contentLength <= 0 ||
        contentLength > PLAYER_PICTURE_MAX_BYTES
    ) {
        return {
            status: false,
            message: `Upload must be between 1 byte and ${PLAYER_PICTURE_MAX_BYTES} bytes.`
        }
    }

    try {
        const timestamp = Date.now()
        const objectKey = `${SCORE_SHEET_PREFIX}/${seasonId}/${date}/div${divisionId}_${timestamp}.jpg`

        const uploadUrl = await createPlayerPictureUploadPresignedUrl({
            key: objectKey,
            contentType: "image/jpeg",
            contentLength
        })

        return { status: true, uploadUrl, objectKey }
    } catch (error) {
        console.error("Error creating score sheet upload URL:", error)
        return { status: false, message: "Failed to start upload." }
    }
}

export async function finalizeScoreSheetUpload(
    divisionId: number,
    date: string,
    objectKey: string
): Promise<{ status: boolean; message: string; scoreSheet?: ScoreSheetData }> {
    const seasonId = await getEnterScoresSeasonId()
    const hasAccess = seasonId
        ? await hasPermissionBySession("scores:enter", { seasonId })
        : false
    if (!hasAccess || !seasonId) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        const [inserted] = await db
            .insert(scoreSheets)
            .values({
                season_id: seasonId,
                division_id: divisionId,
                match_date: date,
                image_path: objectKey,
                uploaded_by:
                    (
                        await auth.api.getSession({
                            headers: await headers()
                        })
                    )?.user.id ?? ""
            })
            .returning({
                id: scoreSheets.id,
                divisionId: scoreSheets.division_id,
                imagePath: scoreSheets.image_path
            })

        const session = await auth.api.getSession({
            headers: await headers()
        })
        if (session) {
            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "score_sheets",
                entityId: String(inserted.id),
                summary: `Uploaded score sheet for division ${divisionId} on ${date}`
            })
        }

        revalidatePath("/dashboard/enter-scores")
        return {
            status: true,
            message: "Score sheet uploaded.",
            scoreSheet: {
                id: inserted.id,
                divisionId: inserted.divisionId,
                imagePath: inserted.imagePath
            }
        }
    } catch (error) {
        console.error("Error finalizing score sheet upload:", error)
        return { status: false, message: "Failed to save score sheet." }
    }
}

export const deleteScoreSheet = withAction(
    async (scoreSheetId: number): Promise<ActionResult> => {
        const seasonId = await getEnterScoresSeasonId()
        const hasAccess = seasonId
            ? await hasPermissionBySession("scores:enter", { seasonId })
            : false
        if (!hasAccess || !seasonId) {
            return fail("Unauthorized")
        }

        try {
            const [row] = await db
                .select({
                    id: scoreSheets.id,
                    seasonId: scoreSheets.season_id,
                    imagePath: scoreSheets.image_path
                })
                .from(scoreSheets)
                .where(eq(scoreSheets.id, scoreSheetId))
                .limit(1)

            if (!row || row.seasonId !== seasonId) {
                return fail("Score sheet not found.")
            }

            // Delete from R2 storage first
            try {
                await deleteR2Object(row.imagePath)
            } catch (r2Error) {
                console.error("Failed to delete R2 object:", r2Error)
            }

            await db.delete(scoreSheets).where(eq(scoreSheets.id, scoreSheetId))

            const session = await auth.api.getSession({
                headers: await headers()
            })
            if (session) {
                await logAuditEntry({
                    userId: session.user.id,
                    action: "delete",
                    entityType: "score_sheets",
                    entityId: String(scoreSheetId),
                    summary: `Deleted score sheet ${scoreSheetId}`
                })
            }

            revalidatePath("/dashboard/enter-scores")
            return ok(undefined, "Score sheet deleted.")
        } catch (error) {
            console.error("Error deleting score sheet:", error)
            return fail("Failed to delete score sheet.")
        }
    }
)
