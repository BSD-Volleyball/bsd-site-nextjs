/**
 * player-schedule.ts — upcoming schedule for a single player in a season,
 * grouped into tryouts / games / reffing / volunteering.
 *
 * Performs NO authorization checks: callers must gate access before invoking.
 * "Upcoming" is date-based (league-local today or later), so today's entries
 * stay visible even after their start time has passed.
 *
 * Playoff play/work rows are NOT resolved here — they need the bracket
 * resolution in getPlayoffNextMatches(), which the getPlayerSchedule action
 * merges in on top of this base data.
 */

import "server-only"

import { db } from "@/database/db"
import {
    divisions,
    eventTimeSlots,
    matchReferees,
    matchSubstitutions,
    matches,
    seasonEvents,
    teams,
    users,
    week1Rosters,
    week2Rosters,
    week3Rosters
} from "@/database/schema"
import { and, asc, eq, gte, inArray, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import {
    LEGACY_COURT_BY_DIVISION,
    getSessionNumberFromTeam
} from "@/lib/courts"
import { getLeagueDateString } from "@/lib/date-utils"
import type {
    PlayerScheduleData,
    PlayerScheduleEntry
} from "@/lib/player-schedule-types"
import { getTeamRosterWithSubs } from "@/lib/roster"
import { formatMatchTime } from "@/lib/season-utils"
import {
    assignmentTimeLabel,
    getVolunteerAssignmentsForSeason,
    isAllNightAssignment
} from "@/lib/tryout-volunteer-schedule"
import { formatDisplayName } from "@/lib/utils"

type SortableEntry = { entry: PlayerScheduleEntry; sortKey: string }

function finalize(items: SortableEntry[]): PlayerScheduleEntry[] {
    return items
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map((i) => i.entry)
}

function sortKeyFor(date: string, rawTime: string | null): string {
    return `${date}T${rawTime ?? "99:99:99"}`
}

async function buildTryouts(
    userId: string,
    seasonId: number,
    today: string
): Promise<PlayerScheduleEntry[]> {
    const tryoutEvents = await db
        .select({ id: seasonEvents.id, eventDate: seasonEvents.event_date })
        .from(seasonEvents)
        .where(
            and(
                eq(seasonEvents.season_id, seasonId),
                eq(seasonEvents.event_type, "tryout")
            )
        )
        .orderBy(asc(seasonEvents.sort_order), asc(seasonEvents.id))
    if (tryoutEvents.length === 0) return []

    const slotRows = await db
        .select({
            eventId: eventTimeSlots.event_id,
            startTime: eventTimeSlots.start_time
        })
        .from(eventTimeSlots)
        .where(
            inArray(
                eventTimeSlots.event_id,
                tryoutEvents.map((e) => e.id)
            )
        )
        .orderBy(asc(eventTimeSlots.sort_order), asc(eventTimeSlots.id))
    const slotsByEvent = new Map<number, string[]>()
    for (const slot of slotRows) {
        const list = slotsByEvent.get(slot.eventId) ?? []
        list.push(slot.startTime)
        slotsByEvent.set(slot.eventId, list)
    }

    const [[w1Row], [w2Row], [w3Row]] = await Promise.all([
        db
            .select({
                session: week1Rosters.session_number,
                court: week1Rosters.court_number
            })
            .from(week1Rosters)
            .where(
                and(
                    eq(week1Rosters.season, seasonId),
                    eq(week1Rosters.user, userId)
                )
            )
            .limit(1),
        db
            .select({
                teamNumber: week2Rosters.team_number,
                isCaptain: week2Rosters.is_captain,
                divisionName: divisions.name
            })
            .from(week2Rosters)
            .innerJoin(divisions, eq(week2Rosters.division, divisions.id))
            .where(
                and(
                    eq(week2Rosters.season, seasonId),
                    eq(week2Rosters.user, userId)
                )
            )
            .limit(1),
        db
            .select({
                teamNumber: week3Rosters.team_number,
                isCaptain: week3Rosters.is_captain,
                divisionName: divisions.name
            })
            .from(week3Rosters)
            .innerJoin(divisions, eq(week3Rosters.division, divisions.id))
            .where(
                and(
                    eq(week3Rosters.season, seasonId),
                    eq(week3Rosters.user, userId)
                )
            )
            .limit(1)
    ])

    const items: SortableEntry[] = []
    const pushWeek = (
        weekIndex: number,
        session: number,
        court: number | null,
        sublabel: string | null
    ) => {
        const event = tryoutEvents[weekIndex]
        if (!event || event.eventDate < today) return
        const startTime = slotsByEvent.get(event.id)?.[session - 1] ?? null
        items.push({
            sortKey: sortKeyFor(event.eventDate, startTime),
            entry: {
                date: event.eventDate,
                timeLabel: startTime ? formatMatchTime(startTime) : null,
                court,
                label: `Tryout ${weekIndex + 1} — Session ${session}`,
                sublabel
            }
        })
    }

    if (w1Row) pushWeek(0, w1Row.session, w1Row.court, null)
    for (const [weekIndex, row] of [
        [1, w2Row],
        [2, w3Row]
    ] as const) {
        if (!row) continue
        pushWeek(
            weekIndex,
            getSessionNumberFromTeam(row.teamNumber),
            LEGACY_COURT_BY_DIVISION[row.divisionName] ?? null,
            `${row.divisionName} Team ${row.teamNumber}${row.isCaptain ? " (captain)" : ""}`
        )
    }

    return finalize(items)
}

async function buildGames(
    userId: string,
    seasonId: number,
    today: string
): Promise<PlayerScheduleEntry[]> {
    const roster = await getTeamRosterWithSubs(seasonId)
    const teamId =
        roster.find((r) => r.activeUser.id === userId)?.teamId ?? null

    // Week-indexed fallback dates for matches without an explicit date.
    const regularEvents = await db
        .select({ eventDate: seasonEvents.event_date })
        .from(seasonEvents)
        .where(
            and(
                eq(seasonEvents.season_id, seasonId),
                eq(seasonEvents.event_type, "regular_season")
            )
        )
        .orderBy(asc(seasonEvents.event_date))

    const homeTeam = alias(teams, "homeTeam")
    const awayTeam = alias(teams, "awayTeam")

    const subRows = await db
        .select({ matchId: matchSubstitutions.match })
        .from(matchSubstitutions)
        .where(
            and(
                eq(matchSubstitutions.season, seasonId),
                eq(matchSubstitutions.original_user, userId)
            )
        )
    const subbedOutMatchIds = new Set(subRows.map((r) => r.matchId))

    const teamName = (name: string | null, number: number | null): string =>
        name ?? (number !== null ? `Team ${number}` : "TBD")

    const items: SortableEntry[] = []

    if (teamId !== null) {
        const teamMatches = await db
            .select({
                id: matches.id,
                week: matches.week,
                date: matches.date,
                time: matches.time,
                court: matches.court,
                homeTeamId: matches.home_team,
                homeName: homeTeam.name,
                homeNumber: homeTeam.number,
                awayName: awayTeam.name,
                awayNumber: awayTeam.number,
                divisionName: divisions.name
            })
            .from(matches)
            .innerJoin(divisions, eq(matches.division, divisions.id))
            .leftJoin(homeTeam, eq(matches.home_team, homeTeam.id))
            .leftJoin(awayTeam, eq(matches.away_team, awayTeam.id))
            .where(
                and(
                    eq(matches.season, seasonId),
                    eq(matches.playoff, false),
                    or(
                        eq(matches.home_team, teamId),
                        eq(matches.away_team, teamId)
                    )
                )
            )

        for (const match of teamMatches) {
            if (subbedOutMatchIds.has(match.id)) continue
            const date =
                match.date ?? regularEvents[match.week - 1]?.eventDate ?? null
            if (!date || date < today) continue
            const opponent =
                match.homeTeamId === teamId
                    ? teamName(match.awayName, match.awayNumber)
                    : teamName(match.homeName, match.homeNumber)
            items.push({
                sortKey: sortKeyFor(date, match.time),
                entry: {
                    date,
                    timeLabel: match.time ? formatMatchTime(match.time) : null,
                    court: match.court,
                    label: `vs ${opponent} (${match.divisionName}, Week ${match.week})`,
                    sublabel: null
                }
            })
        }
    }

    // One-off pickups where this player subs in for someone else's match.
    const pickups = await db
        .select({
            week: matches.week,
            date: matches.date,
            time: matches.time,
            court: matches.court,
            playoff: matches.playoff,
            subTeamId: matchSubstitutions.team,
            homeTeamId: matches.home_team,
            homeName: homeTeam.name,
            homeNumber: homeTeam.number,
            awayName: awayTeam.name,
            awayNumber: awayTeam.number,
            divisionName: divisions.name,
            originalFirst: users.first_name,
            originalLast: users.last_name,
            originalPreferred: users.preferred_name
        })
        .from(matchSubstitutions)
        .innerJoin(matches, eq(matchSubstitutions.match, matches.id))
        .innerJoin(divisions, eq(matches.division, divisions.id))
        .innerJoin(users, eq(matchSubstitutions.original_user, users.id))
        .leftJoin(homeTeam, eq(matches.home_team, homeTeam.id))
        .leftJoin(awayTeam, eq(matches.away_team, awayTeam.id))
        .where(
            and(
                eq(matchSubstitutions.season, seasonId),
                eq(matchSubstitutions.sub_user, userId)
            )
        )

    for (const pickup of pickups) {
        const date = pickup.playoff
            ? pickup.date
            : (pickup.date ?? regularEvents[pickup.week - 1]?.eventDate ?? null)
        if (!date || date < today) continue
        const opponent =
            pickup.subTeamId === pickup.homeTeamId
                ? teamName(pickup.awayName, pickup.awayNumber)
                : teamName(pickup.homeName, pickup.homeNumber)
        items.push({
            sortKey: sortKeyFor(date, pickup.time),
            entry: {
                date,
                timeLabel: pickup.time ? formatMatchTime(pickup.time) : null,
                court: pickup.court,
                label: `vs ${opponent} (${pickup.divisionName}, Week ${pickup.week})`,
                sublabel: `Subbing for ${formatDisplayName(
                    pickup.originalFirst,
                    pickup.originalLast,
                    pickup.originalPreferred
                )}`
            }
        })
    }

    return finalize(items)
}

async function buildReffing(
    userId: string,
    seasonId: number,
    today: string
): Promise<PlayerScheduleEntry[]> {
    const homeTeam = alias(teams, "homeTeam")
    const awayTeam = alias(teams, "awayTeam")

    const rows = await db
        .select({
            date: matches.date,
            time: matches.time,
            court: matches.court,
            homeName: homeTeam.name,
            homeNumber: homeTeam.number,
            awayName: awayTeam.name,
            awayNumber: awayTeam.number,
            divisionName: divisions.name
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
                gte(matches.date, today)
            )
        )
        .orderBy(asc(matches.date), asc(matches.time))

    const teamName = (name: string | null, number: number | null): string =>
        name ?? (number !== null ? `Team ${number}` : "TBD")

    return rows
        .filter((r): r is typeof r & { date: string } => r.date !== null)
        .map((r) => ({
            date: r.date,
            timeLabel: r.time ? formatMatchTime(r.time) : null,
            court: r.court,
            label: `Ref: ${teamName(r.homeName, r.homeNumber)} vs ${teamName(
                r.awayName,
                r.awayNumber
            )} (${r.divisionName})`,
            sublabel: null
        }))
}

async function buildVolunteering(
    userId: string,
    seasonId: number,
    today: string
): Promise<PlayerScheduleEntry[]> {
    const assignments = await getVolunteerAssignmentsForSeason(seasonId)
    return finalize(
        assignments
            .filter((a) => a.userId === userId && a.eventDate >= today)
            .map((a) => ({
                // Whole-night jobs span the evening, so they sort ahead of
                // the per-session ones instead of taking sortKeyFor's
                // unknown-time default, which sorts last.
                sortKey: sortKeyFor(
                    a.eventDate,
                    isAllNightAssignment(a) ? "00:00:00" : a.startTime
                ),
                entry: {
                    date: a.eventDate,
                    timeLabel: assignmentTimeLabel(a),
                    court: null,
                    label:
                        a.ordinal > 0
                            ? `${a.jobName} — Tryout ${a.ordinal}`
                            : a.jobName,
                    sublabel: null
                }
            }))
    )
}

/**
 * Upcoming (league-local today or later) schedule for a player in a season,
 * excluding playoff play/work rows (merged in by the calling action).
 */
export async function getPlayerScheduleForUser(
    userId: string,
    seasonId: number
): Promise<PlayerScheduleData> {
    const today = getLeagueDateString()
    const [tryouts, games, reffing, volunteering] = await Promise.all([
        buildTryouts(userId, seasonId, today),
        buildGames(userId, seasonId, today),
        buildReffing(userId, seasonId, today),
        buildVolunteering(userId, seasonId, today)
    ])
    return { tryouts, games, reffing, volunteering }
}
