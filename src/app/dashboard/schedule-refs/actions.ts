"use server"

import { db } from "@/database/db"
import {
    matches,
    matchReferees,
    seasonRefs,
    users,
    divisions,
    teams,
    drafts,
    seasonEvents,
    userUnavailability,
    seasons
} from "@/database/schema"
import { eq, and, asc, inArray, or } from "drizzle-orm"
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
    homeTeamName: string
    awayTeamName: string
    assignedRefId: string | null
    assignedRefName: string | null
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
                homeTeamName: homeTeam.name,
                awayTeamName: awayTeam.name
            })
            .from(matches)
            .innerJoin(divisions, eq(matches.division, divisions.id))
            .innerJoin(homeTeam, eq(matches.home_team, homeTeam.id))
            .innerJoin(awayTeam, eq(matches.away_team, awayTeam.id))
            .where(and(eq(matches.season, seasonId), eq(matches.date, date)))
            .orderBy(asc(matches.time), asc(matches.court))

        if (matchRows.length === 0) {
            return ok({ matches: [], refs: [], eligibleRefsByMatch: {} })
        }

        const matchIds = matchRows.map((m) => m.matchId)

        // ── Fetch existing ref assignments ──────────────────────
        const assignmentRows = await db
            .select({
                matchId: matchReferees.match_id,
                refereeId: matchReferees.referee_id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(matchReferees)
            .innerJoin(users, eq(matchReferees.referee_id, users.id))
            .where(inArray(matchReferees.match_id, matchIds))

        const assignmentByMatch = new Map<
            number,
            { refId: string; refName: string }
        >()
        for (const a of assignmentRows) {
            assignmentByMatch.set(a.matchId, {
                refId: a.refereeId,
                refName: formatPlayerName(
                    a.firstName,
                    a.lastName,
                    a.preferredName
                )
            })
        }

        // ── Build match result list ─────────────────────────────
        const matchList: MatchRow[] = matchRows.map((m) => {
            const assignment = assignmentByMatch.get(m.matchId)
            return {
                matchId: m.matchId,
                time: m.time ?? "",
                court: m.court,
                divisionId: m.divisionId,
                divisionName: m.divisionName,
                divisionLevel: m.divisionLevel,
                homeTeamName: m.homeTeamName,
                awayTeamName: m.awayTeamName,
                assignedRefId: assignment?.refId ?? null,
                assignedRefName: assignment?.refName ?? null
            }
        })

        // ── Fetch all season refs ───────────────────────────────
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
            .where(eq(seasonRefs.season_id, seasonId))

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
        // Map: matchId -> assigned refId (to exclude the match's own ref)
        const assignedRefByMatch = new Map<string, string>()
        for (const a of allDateAssignments) {
            const t = a.matchTime ?? ""
            if (!assignedByTime.has(t)) {
                assignedByTime.set(t, new Set())
            }
            assignedByTime.get(t)!.add(a.refereeId)
            assignedRefByMatch.set(String(a.matchId), a.refereeId)
        }

        // ── Build eligible refs per match ───────────────────────
        const eligibleRefsByMatch: Record<number, EligibleRef[]> = {}

        for (const match of matchList) {
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
                    const thisMatchRef = assignedRefByMatch.get(
                        String(match.matchId)
                    )
                    if (thisMatchRef !== ref.userId) {
                        continue
                    }
                }

                // Unavailable refs are included but flagged — scheduler must confirm
                eligible.push({
                    userId: ref.userId,
                    name: ref.name,
                    isUnavailable: ref.isUnavailable
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
        assignments: Array<{ matchId: number; refereeId: string | null }>
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

        await db.transaction(async (tx) => {
            for (const { matchId, refereeId } of assignments) {
                if (!matchId || typeof matchId !== "number") continue

                // Delete existing assignment for this match
                await tx
                    .delete(matchReferees)
                    .where(eq(matchReferees.match_id, matchId))

                // Insert new assignment if refereeId is set
                if (refereeId && typeof refereeId === "string") {
                    await tx.insert(matchReferees).values({
                        match_id: matchId,
                        referee_id: refereeId,
                        season_id: seasonId
                    })
                }
            }
        })

        revalidatePath("/dashboard/schedule-refs")
        revalidatePath("/dashboard/reffing-schedule")
        return ok()
    }
)
