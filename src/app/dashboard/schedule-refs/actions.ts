"use server"

import { db } from "@/database/db"
import {
    matches,
    matchReferees,
    playoffMatchesMeta,
    seasonRefs,
    users,
    divisions,
    teams,
    drafts,
    seasonEvents,
    userUnavailability,
    seasons
} from "@/database/schema"
import { eq, and, asc, inArray, or, gt } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { revalidatePath } from "next/cache"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requireSeasonConfig,
    ActionError
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"
import { hasPermissionBySession, isAdminOrDirectorBySession } from "@/lib/rbac"
import { formatPlayerName } from "@/lib/utils"
import {
    collectPossibleTeams,
    formatSourceHumanLabel,
    parseSourceToken,
    resolveSourceToTeamId,
    type BracketMatchRef,
    type ParsedSource
} from "@/lib/playoff-sources"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchDate {
    date: string
    label: string
    matchCount: number
}

export interface ScheduleRefsData {
    seasonId: number
    seasonLabel: string
    matchDates: MatchDate[]
}

export interface MatchRow {
    matchId: number
    time: string
    court: number | null
    divisionId: number
    divisionName: string
    divisionLevel: number
    isPlayoff: boolean
    homeTeamName: string | null
    awayTeamName: string | null
    homeSourceLabel: string | null
    awaySourceLabel: string | null
    homePossibleTeams: string[]
    awayPossibleTeams: string[]
    primaryRefId: string | null
    primaryRefName: string | null
    backupRefId: string | null
    backupRefName: string | null
}

export interface RefStatus {
    userId: string
    name: string
    isCertified: boolean
    maxDivisionLevel: number
    isUnavailable: boolean
    playingTimeSlot: string | null
    playingInfo: string | null
}

export interface EligibleRef {
    userId: string
    name: string
    isUnavailable: boolean
    /**
     * Set on dynamic playoff matches when this ref's own team is one of the
     * possible participants — surfaced to the picker so the scheduler avoids
     * assigning two refs from the same team as primary + backup.
     */
    possibleTeamName: string | null
}

export interface MatchesAndRefsData {
    matches: MatchRow[]
    refs: RefStatus[]
    eligibleRefsByMatch: Record<number, EligibleRef[]>
}

// ---------------------------------------------------------------------------
// Authorization helper
// ---------------------------------------------------------------------------

async function requireScheduleRefsAccess(): Promise<void> {
    const hasSchedule = await hasPermissionBySession("schedule:manage")
    if (hasSchedule) return
    const isAdmin = await isAdminOrDirectorBySession()
    if (isAdmin) return
    throw new ActionError("Unauthorized.")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateLabel(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00`)
    return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
    })
}

function formatTime(time: string): string {
    const [hours, minutes] = time.split(":").map(Number)
    const period = hours >= 12 ? "PM" : "AM"
    const displayHour = hours % 12 || 12
    return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`
}

// ---------------------------------------------------------------------------
// 1. getScheduleRefsData — match dates for current season
// ---------------------------------------------------------------------------

export async function getScheduleRefsData(): Promise<
    ActionResult<ScheduleRefsData>
> {
    try {
        await requireScheduleRefsAccess()
        const config = await requireSeasonConfig()

        const [season] = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                season: seasons.season
            })
            .from(seasons)
            .where(eq(seasons.id, config.seasonId))
            .limit(1)

        if (!season) {
            return fail("Season not found.")
        }

        const seasonLabel = `${season.season} ${season.year}`

        const allMatches = await db
            .select({
                date: matches.date
            })
            .from(matches)
            .where(eq(matches.season, config.seasonId))
            .orderBy(asc(matches.date))

        // Build distinct dates with counts
        const dateMap = new Map<string, number>()
        for (const m of allMatches) {
            if (!m.date) continue
            dateMap.set(m.date, (dateMap.get(m.date) ?? 0) + 1)
        }

        const matchDates: MatchDate[] = []
        for (const [date, count] of dateMap) {
            matchDates.push({
                date,
                label: formatDateLabel(date),
                matchCount: count
            })
        }

        return ok({ seasonId: config.seasonId, seasonLabel, matchDates })
    } catch (error) {
        if (error instanceof ActionError) return fail(error.message)
        console.error("getScheduleRefsData error:", error)
        return fail("Something went wrong.")
    }
}

// ---------------------------------------------------------------------------
// 2. getMatchesAndRefsForDate — main data action
// ---------------------------------------------------------------------------

export async function getMatchesAndRefsForDate(
    date: string
): Promise<ActionResult<MatchesAndRefsData>> {
    try {
        await requireScheduleRefsAccess()
        const config = await requireSeasonConfig()
        const seasonId = config.seasonId

        // ── Fetch matches for date ──────────────────────────────
        const homeTeam = alias(teams, "homeTeam")
        const awayTeam = alias(teams, "awayTeam")

        const matchRows = await db
            .select({
                matchId: matches.id,
                time: matches.time,
                court: matches.court,
                divisionId: matches.division,
                divisionName: divisions.name,
                divisionLevel: divisions.level,
                isPlayoff: matches.playoff,
                week: matches.week,
                homeTeamId: matches.home_team,
                awayTeamId: matches.away_team,
                homeTeamName: homeTeam.name,
                awayTeamName: awayTeam.name
            })
            .from(matches)
            .innerJoin(divisions, eq(matches.division, divisions.id))
            .leftJoin(homeTeam, eq(matches.home_team, homeTeam.id))
            .leftJoin(awayTeam, eq(matches.away_team, awayTeam.id))
            .where(and(eq(matches.season, seasonId), eq(matches.date, date)))
            .orderBy(asc(matches.time), asc(matches.court))

        if (matchRows.length === 0) {
            return ok({ matches: [], refs: [], eligibleRefsByMatch: {} })
        }

        const matchIds = matchRows.map((m) => m.matchId)

        // ── Fetch existing ref assignments (primary + backup) ───
        const assignmentRows = await db
            .select({
                matchId: matchReferees.match_id,
                refereeId: matchReferees.referee_id,
                role: matchReferees.role,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(matchReferees)
            .innerJoin(users, eq(matchReferees.referee_id, users.id))
            .where(inArray(matchReferees.match_id, matchIds))

        const primaryByMatch = new Map<
            number,
            { refId: string; refName: string }
        >()
        const backupByMatch = new Map<
            number,
            { refId: string; refName: string }
        >()
        for (const a of assignmentRows) {
            const entry = {
                refId: a.refereeId,
                refName: formatPlayerName(
                    a.firstName,
                    a.lastName,
                    a.preferredName
                )
            }
            if (a.role === "backup") {
                backupByMatch.set(a.matchId, entry)
            } else {
                primaryByMatch.set(a.matchId, entry)
            }
        }

        // ── Resolve playoff sources for dynamic matches ─────────
        // Group matches by (division, week) so we walk the bracket within scope.
        const playoffMatchIds = matchRows
            .filter((m) => m.isPlayoff)
            .map((m) => m.matchId)

        // matchId -> resolved labels and possible-team sets (team IDs)
        const playoffInfoByMatchId = new Map<
            number,
            {
                homeSourceLabel: string | null
                awaySourceLabel: string | null
                homeResolvedTeamId: number | null
                awayResolvedTeamId: number | null
                homePossibleTeamIds: Set<number>
                awayPossibleTeamIds: Set<number>
            }
        >()
        const teamNameById = new Map<number, string>()

        if (playoffMatchIds.length > 0) {
            // Group target matches by (division, week)
            const groupKey = (div: number, wk: number) => `${div}:${wk}`
            const groupsOnDate = new Set<string>()
            for (const m of matchRows) {
                if (m.isPlayoff) {
                    groupsOnDate.add(groupKey(m.divisionId, m.week))
                }
            }

            // Fetch ALL playoff meta + matches for those (division, week)
            // groups in the season — even ones not on this date — so we can
            // walk W/L lineage and pull seed-resolved teams from already-realized matches.
            const targetDivisions = Array.from(
                new Set(
                    matchRows
                        .filter((m) => m.isPlayoff)
                        .map((m) => m.divisionId)
                )
            )

            const metaRows = await db
                .select({
                    metaId: playoffMatchesMeta.id,
                    matchId: playoffMatchesMeta.match_id,
                    matchNum: playoffMatchesMeta.match_num,
                    division: playoffMatchesMeta.division,
                    week: playoffMatchesMeta.week,
                    homeSource: playoffMatchesMeta.home_source,
                    awaySource: playoffMatchesMeta.away_source
                })
                .from(playoffMatchesMeta)
                .where(
                    and(
                        eq(playoffMatchesMeta.season, seasonId),
                        inArray(playoffMatchesMeta.division, targetDivisions)
                    )
                )

            // Pull every playoff match referenced by these metas so we know
            // who's already realized (home/away/winner).
            const referencedMatchIds = metaRows
                .map((mr) => mr.matchId)
                .filter((id): id is number => id !== null)

            type RealizedMatch = {
                id: number
                homeTeamId: number | null
                awayTeamId: number | null
                winner: number | null
            }
            const realizedMatches: RealizedMatch[] =
                referencedMatchIds.length === 0
                    ? []
                    : await db
                          .select({
                              id: matches.id,
                              homeTeamId: matches.home_team,
                              awayTeamId: matches.away_team,
                              winner: matches.winner
                          })
                          .from(matches)
                          .where(inArray(matches.id, referencedMatchIds))

            const realizedById = new Map<number, RealizedMatch>()
            for (const rm of realizedMatches) {
                realizedById.set(rm.id, rm)
            }

            // Build per-group bracket context: matchNum -> meta, plus
            // resolution maps for seeds and known winners/losers.
            const groupMetas = new Map<
                string,
                {
                    matchByNum: Map<number, BracketMatchRef>
                    metaByMatchId: Map<
                        number,
                        {
                            home: ParsedSource
                            away: ParsedSource
                        }
                    >
                    seedToTeamId: Map<number, number>
                    winnerByMatchNum: Map<number, number>
                    loserByMatchNum: Map<number, number>
                }
            >()

            for (const key of groupsOnDate) {
                groupMetas.set(key, {
                    matchByNum: new Map(),
                    metaByMatchId: new Map(),
                    seedToTeamId: new Map(),
                    winnerByMatchNum: new Map(),
                    loserByMatchNum: new Map()
                })
            }

            for (const meta of metaRows) {
                const key = groupKey(meta.division, meta.week)
                const ctx = groupMetas.get(key)
                if (!ctx) continue

                const home = parseSourceToken(meta.homeSource)
                const away = parseSourceToken(meta.awaySource)

                ctx.matchByNum.set(meta.matchNum, {
                    matchNum: meta.matchNum,
                    homeSource: home,
                    awaySource: away
                })
                if (meta.matchId !== null) {
                    ctx.metaByMatchId.set(meta.matchId, { home, away })
                }

                const realized =
                    meta.matchId !== null
                        ? realizedById.get(meta.matchId)
                        : null

                // Derive seed -> teamId from already-realized seed sources
                if (
                    home.kind === "seed" &&
                    home.value !== null &&
                    realized?.homeTeamId
                ) {
                    ctx.seedToTeamId.set(home.value, realized.homeTeamId)
                }
                if (
                    away.kind === "seed" &&
                    away.value !== null &&
                    realized?.awayTeamId
                ) {
                    ctx.seedToTeamId.set(away.value, realized.awayTeamId)
                }
                if (
                    home.kind === "team" &&
                    home.value !== null &&
                    realized?.homeTeamId
                ) {
                    // direct team number — keep as-is in case ctx walks back to it
                }

                // Derive winnerByMatchNum / loserByMatchNum from realized results
                if (
                    realized?.winner &&
                    realized.homeTeamId &&
                    realized.awayTeamId
                ) {
                    ctx.winnerByMatchNum.set(meta.matchNum, realized.winner)
                    const loser =
                        realized.winner === realized.homeTeamId
                            ? realized.awayTeamId
                            : realized.homeTeamId
                    ctx.loserByMatchNum.set(meta.matchNum, loser)
                }
            }

            // Collect all team IDs we might need names for
            const teamIdsToName = new Set<number>()
            for (const ctx of groupMetas.values()) {
                for (const id of ctx.seedToTeamId.values())
                    teamIdsToName.add(id)
                for (const id of ctx.winnerByMatchNum.values())
                    teamIdsToName.add(id)
                for (const id of ctx.loserByMatchNum.values())
                    teamIdsToName.add(id)
            }
            // Plus all home/away ids on visible matches
            for (const m of matchRows) {
                if (m.homeTeamId) teamIdsToName.add(m.homeTeamId)
                if (m.awayTeamId) teamIdsToName.add(m.awayTeamId)
            }

            if (teamIdsToName.size > 0) {
                const teamNameRows = await db
                    .select({ id: teams.id, name: teams.name })
                    .from(teams)
                    .where(inArray(teams.id, Array.from(teamIdsToName)))
                for (const tn of teamNameRows) {
                    teamNameById.set(tn.id, tn.name)
                }
            }

            // Now compute per-match resolution
            for (const m of matchRows) {
                if (!m.isPlayoff) continue
                const ctx = groupMetas.get(groupKey(m.divisionId, m.week))
                if (!ctx) continue
                const metaFor = ctx.metaByMatchId.get(m.matchId)
                if (!metaFor) continue

                const homeResolved = resolveSourceToTeamId(metaFor.home, ctx)
                const awayResolved = resolveSourceToTeamId(metaFor.away, ctx)

                const homePossible = collectPossibleTeams(
                    metaFor.home,
                    ctx,
                    ctx.matchByNum
                )
                const awayPossible = collectPossibleTeams(
                    metaFor.away,
                    ctx,
                    ctx.matchByNum
                )

                playoffInfoByMatchId.set(m.matchId, {
                    homeSourceLabel: formatSourceHumanLabel(metaFor.home),
                    awaySourceLabel: formatSourceHumanLabel(metaFor.away),
                    homeResolvedTeamId: homeResolved,
                    awayResolvedTeamId: awayResolved,
                    homePossibleTeamIds: homePossible,
                    awayPossibleTeamIds: awayPossible
                })
            }
        }

        // ── Build match result list ─────────────────────────────
        const matchList: MatchRow[] = matchRows.map((m) => {
            const primary = primaryByMatch.get(m.matchId)
            const backup = backupByMatch.get(m.matchId)
            const info = playoffInfoByMatchId.get(m.matchId)

            const homePossibleNames: string[] = []
            const awayPossibleNames: string[] = []
            if (info && !m.homeTeamName) {
                for (const id of info.homePossibleTeamIds) {
                    const name = teamNameById.get(id)
                    if (name) homePossibleNames.push(name)
                }
                homePossibleNames.sort()
            }
            if (info && !m.awayTeamName) {
                for (const id of info.awayPossibleTeamIds) {
                    const name = teamNameById.get(id)
                    if (name) awayPossibleNames.push(name)
                }
                awayPossibleNames.sort()
            }

            return {
                matchId: m.matchId,
                time: m.time ?? "",
                court: m.court,
                divisionId: m.divisionId,
                divisionName: m.divisionName,
                divisionLevel: m.divisionLevel,
                isPlayoff: m.isPlayoff,
                homeTeamName: m.homeTeamName,
                awayTeamName: m.awayTeamName,
                homeSourceLabel:
                    !m.homeTeamName && info ? info.homeSourceLabel : null,
                awaySourceLabel:
                    !m.awayTeamName && info ? info.awaySourceLabel : null,
                homePossibleTeams: homePossibleNames,
                awayPossibleTeams: awayPossibleNames,
                primaryRefId: primary?.refId ?? null,
                primaryRefName: primary?.refName ?? null,
                backupRefId: backup?.refId ?? null,
                backupRefName: backup?.refName ?? null
            }
        })

        // ── Fetch all season refs (active only, with a valid division level) ──
        const refRows = await db
            .select({
                seasonRefId: seasonRefs.id,
                userId: seasonRefs.user_id,
                isCertified: seasonRefs.is_certified,
                maxDivisionLevel: seasonRefs.max_division_level,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(seasonRefs)
            .innerJoin(users, eq(seasonRefs.user_id, users.id))
            .where(
                and(
                    eq(seasonRefs.season_id, seasonId),
                    eq(seasonRefs.is_active, true),
                    gt(seasonRefs.max_division_level, 0)
                )
            )

        if (refRows.length === 0) {
            return ok({
                matches: matchList,
                refs: [],
                eligibleRefsByMatch: {}
            })
        }

        const refUserIds = refRows.map((r) => r.userId)

        // ── Check unavailability ────────────────────────────────
        // Find season events for this date
        const eventsForDate = await db
            .select({ id: seasonEvents.id })
            .from(seasonEvents)
            .where(
                and(
                    eq(seasonEvents.season_id, seasonId),
                    eq(seasonEvents.event_date, date)
                )
            )

        const eventIds = eventsForDate.map((e) => e.id)

        // Unified unavailability: all refs via userUnavailability.user_id
        const unavailablePlayerIds = new Set<string>()
        if (eventIds.length > 0) {
            const unavailRows = await db
                .select({ userId: userUnavailability.user_id })
                .from(userUnavailability)
                .where(
                    and(
                        inArray(userUnavailability.user_id, refUserIds),
                        inArray(userUnavailability.event_id, eventIds)
                    )
                )
            for (const row of unavailRows) {
                unavailablePlayerIds.add(row.userId)
            }
        }

        // ── Check if refs are playing on this date ──────────────
        // Find each ref's team (via drafts -> teams for this season)
        const draftRows = await db
            .select({
                userId: drafts.user,
                teamId: drafts.team,
                teamSeason: teams.season
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(
                and(
                    inArray(drafts.user, refUserIds),
                    eq(teams.season, seasonId)
                )
            )

        // Map userId -> teamId
        const refTeamMap = new Map<string, number>()
        for (const d of draftRows) {
            refTeamMap.set(d.userId, d.teamId)
        }

        // Also check if ref is a captain (not drafted but on a team)
        const captainRows = await db
            .select({
                captainId: teams.captain,
                captain2Id: teams.captain2,
                teamId: teams.id
            })
            .from(teams)
            .where(
                and(
                    eq(teams.season, seasonId),
                    or(
                        inArray(teams.captain, refUserIds),
                        inArray(teams.captain2, refUserIds)
                    )
                )
            )

        for (const c of captainRows) {
            if (
                refUserIds.includes(c.captainId) &&
                !refTeamMap.has(c.captainId)
            ) {
                refTeamMap.set(c.captainId, c.teamId)
            }
            if (
                c.captain2Id &&
                refUserIds.includes(c.captain2Id) &&
                !refTeamMap.has(c.captain2Id)
            ) {
                refTeamMap.set(c.captain2Id, c.teamId)
            }
        }

        // Find all matches on this date for these teams
        const teamIds = [...new Set(refTeamMap.values())]
        const teamMatchMap = new Map<
            number,
            { time: string; court: number | null }
        >()

        if (teamIds.length > 0) {
            const teamMatchRows = await db
                .select({
                    matchId: matches.id,
                    time: matches.time,
                    court: matches.court,
                    homeTeam: matches.home_team,
                    awayTeam: matches.away_team
                })
                .from(matches)
                .where(
                    and(
                        eq(matches.season, seasonId),
                        eq(matches.date, date),
                        or(
                            inArray(matches.home_team, teamIds),
                            inArray(matches.away_team, teamIds)
                        )
                    )
                )

            for (const tm of teamMatchRows) {
                const time = tm.time ?? ""
                if (tm.homeTeam) {
                    teamMatchMap.set(tm.homeTeam, {
                        time,
                        court: tm.court
                    })
                }
                if (tm.awayTeam) {
                    teamMatchMap.set(tm.awayTeam, {
                        time,
                        court: tm.court
                    })
                }
            }
        }

        // ── Build ref status list ───────────────────────────────
        const refStatusList: RefStatus[] = refRows.map((r) => {
            const name = formatPlayerName(
                r.firstName,
                r.lastName,
                r.preferredName
            )
            const isUnavailable = unavailablePlayerIds.has(r.userId)
            const teamId = refTeamMap.get(r.userId)
            const teamMatch = teamId ? teamMatchMap.get(teamId) : undefined

            let playingTimeSlot: string | null = null
            let playingInfo: string | null = null
            if (teamMatch?.time) {
                playingTimeSlot = teamMatch.time
                const courtStr =
                    teamMatch.court != null
                        ? ` on Court ${teamMatch.court}`
                        : ""
                playingInfo = `Playing at ${formatTime(teamMatch.time)}${courtStr}`
            }

            return {
                userId: r.userId,
                name,
                isCertified: r.isCertified,
                maxDivisionLevel: r.maxDivisionLevel,
                isUnavailable,
                playingTimeSlot,
                playingInfo
            }
        })

        // Sort refs by name
        refStatusList.sort((a, b) => a.name.localeCompare(b.name))

        // ── Fetch all ref assignments at every time on this date ─
        // (to check double-booking across matches at the same time)
        const allDateAssignments = await db
            .select({
                matchId: matchReferees.match_id,
                refereeId: matchReferees.referee_id,
                matchTime: matches.time
            })
            .from(matchReferees)
            .innerJoin(matches, eq(matchReferees.match_id, matches.id))
            .where(and(eq(matches.season, seasonId), eq(matches.date, date)))

        // Map: time -> set of referee IDs already assigned
        const assignedByTime = new Map<string, Set<string>>()
        // Map: matchId -> set of refIds assigned to that match (primary + backup)
        const assignedRefByMatch = new Map<string, Set<string>>()
        for (const a of allDateAssignments) {
            const t = a.matchTime ?? ""
            if (!assignedByTime.has(t)) {
                assignedByTime.set(t, new Set())
            }
            assignedByTime.get(t)!.add(a.refereeId)
            const key = String(a.matchId)
            if (!assignedRefByMatch.has(key)) {
                assignedRefByMatch.set(key, new Set())
            }
            assignedRefByMatch.get(key)!.add(a.refereeId)
        }

        // ── Build eligible refs per match ───────────────────────
        const eligibleRefsByMatch: Record<number, EligibleRef[]> = {}

        for (const match of matchList) {
            // For dynamic playoff matches we exclude refs whose team is a
            // KNOWN/GUARANTEED participant (source resolves to a concrete
            // team). Possible-but-undetermined teams do not constrain.
            const info = playoffInfoByMatchId.get(match.matchId)
            const knownParticipantTeamIds = new Set<number>()
            const possibleTeamIds = new Set<number>()
            if (info) {
                if (info.homeResolvedTeamId !== null) {
                    knownParticipantTeamIds.add(info.homeResolvedTeamId)
                }
                if (info.awayResolvedTeamId !== null) {
                    knownParticipantTeamIds.add(info.awayResolvedTeamId)
                }
                // Hint set is only meaningful when at least one side is
                // unresolved — i.e. a dynamic match.
                const hasUnresolvedSide =
                    !match.homeTeamName || !match.awayTeamName
                if (hasUnresolvedSide) {
                    for (const id of info.homePossibleTeamIds) {
                        possibleTeamIds.add(id)
                    }
                    for (const id of info.awayPossibleTeamIds) {
                        possibleTeamIds.add(id)
                    }
                }
            }

            const eligible: EligibleRef[] = []
            for (const ref of refStatusList) {
                // a. Qualified for division level (hard filter)
                if (ref.maxDivisionLevel > match.divisionLevel) continue

                // b. Not playing at same time (hard filter)
                if (ref.playingTimeSlot && ref.playingTimeSlot === match.time) {
                    continue
                }

                // c. Not already assigned to another match at same time (hard filter)
                const assignedAtTime = assignedByTime.get(match.time)
                if (assignedAtTime?.has(ref.userId)) {
                    // Allow if the ref is assigned to THIS match
                    const thisMatchAssigned =
                        assignedRefByMatch.get(String(match.matchId)) ??
                        new Set()
                    if (!thisMatchAssigned.has(ref.userId)) {
                        continue
                    }
                }

                // d. For dynamic matches: exclude refs on a known participant
                // team (only applies when team_team is null on the match but
                // the source resolves concretely).
                if (knownParticipantTeamIds.size > 0) {
                    const refTeamId = refTeamMap.get(ref.userId)
                    if (
                        refTeamId !== undefined &&
                        knownParticipantTeamIds.has(refTeamId)
                    ) {
                        continue
                    }
                }

                // If the ref's team is one of the possible (but not yet
                // guaranteed) participants of a dynamic match, surface the
                // team name so the coordinator can avoid putting two refs
                // from the same team on primary + backup.
                let possibleTeamName: string | null = null
                if (possibleTeamIds.size > 0) {
                    const refTeamId = refTeamMap.get(ref.userId)
                    if (
                        refTeamId !== undefined &&
                        possibleTeamIds.has(refTeamId)
                    ) {
                        possibleTeamName = teamNameById.get(refTeamId) ?? null
                    }
                }

                // Unavailable refs are included but flagged — scheduler must confirm
                eligible.push({
                    userId: ref.userId,
                    name: ref.name,
                    isUnavailable: ref.isUnavailable,
                    possibleTeamName
                })
            }
            eligibleRefsByMatch[match.matchId] = eligible
        }

        return ok({
            matches: matchList,
            refs: refStatusList,
            eligibleRefsByMatch
        })
    } catch (error) {
        if (error instanceof ActionError) return fail(error.message)
        console.error("getMatchesAndRefsForDate error:", error)
        return fail("Something went wrong.")
    }
}

// ---------------------------------------------------------------------------
// 3. saveRefAssignments — save all ref assignments for a date
// ---------------------------------------------------------------------------

export const saveRefAssignments = withAction(
    async (
        date: string,
        assignments: Array<{
            matchId: number
            primaryRefId: string | null
            backupRefId: string | null
        }>
    ): Promise<ActionResult> => {
        await requireSession()
        await requireScheduleRefsAccess()
        const config = await requireSeasonConfig()
        const seasonId = config.seasonId

        if (!date || typeof date !== "string") {
            return fail("Invalid date.")
        }

        if (!Array.isArray(assignments)) {
            return fail("Invalid assignments.")
        }

        for (const a of assignments) {
            if (
                a.primaryRefId &&
                a.backupRefId &&
                a.primaryRefId === a.backupRefId
            ) {
                return fail(
                    `Primary and backup ref cannot be the same person (match ${a.matchId}).`
                )
            }
        }

        await db.transaction(async (tx) => {
            for (const { matchId, primaryRefId, backupRefId } of assignments) {
                if (!matchId || typeof matchId !== "number") continue

                // Delete existing assignments for this match
                await tx
                    .delete(matchReferees)
                    .where(eq(matchReferees.match_id, matchId))

                if (primaryRefId && typeof primaryRefId === "string") {
                    await tx.insert(matchReferees).values({
                        match_id: matchId,
                        referee_id: primaryRefId,
                        season_id: seasonId,
                        role: "primary"
                    })
                }

                if (backupRefId && typeof backupRefId === "string") {
                    await tx.insert(matchReferees).values({
                        match_id: matchId,
                        referee_id: backupRefId,
                        season_id: seasonId,
                        role: "backup"
                    })
                }
            }
        })

        revalidatePath("/dashboard/schedule-refs")
        revalidatePath("/dashboard/reffing-schedule")
        return ok()
    }
)
