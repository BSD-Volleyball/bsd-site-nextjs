/**
 * schedule-items.ts — raw, whole-season schedule items for a set of users.
 *
 * This is the single source of truth for "what is this person doing this
 * season": regular-season and playoff matches (team via roster-with-subs,
 * one-off pickups included, games they were subbed out of excluded), playoff
 * work duty, reffing, tryout sessions and tryout volunteer jobs. It returns
 * structured rows with raw dates/times so both the player-schedule popup
 * (labels, upcoming only) and the iCalendar feeds (whole season, multiple
 * users) can be built on top without re-deriving business rules.
 *
 * Performs NO authorization checks: callers must gate access.
 */

import "server-only"

import { and, asc, eq, inArray, isNotNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "@/database/db"
import {
    divisions,
    eventTimeSlots,
    matchReferees,
    matchSubstitutions,
    matches,
    playoffMatchesMeta,
    seasonEvents,
    seasons,
    signups,
    teams,
    userUnavailability,
    users,
    week1Rosters,
    week2Rosters,
    week3Rosters
} from "@/database/schema"
import {
    FOUR_TEAM_TIMES,
    SIX_TEAM_TIMES
} from "@/app/dashboard/create-schedule/schedule-constants"
import {
    LEGACY_COURT_BY_DIVISION,
    getSessionNumberFromTeam
} from "@/lib/courts"
import {
    MATCH_DURATION_MINUTES,
    addMinutes,
    parseTime
} from "@/lib/generate-ical"
import { getTeamRosterWithSubs } from "@/lib/roster"
import { formatSeasonLabel } from "@/lib/season-utils"
import {
    EMPTY_SCHEDULE_BUNDLE,
    type EventPlaceholder,
    type ScheduleItem,
    type SchedulePerson,
    type UserScheduleBundle
} from "@/lib/schedule-item-types"
import {
    getVolunteerAssignmentsForSeason,
    isAllNightAssignment
} from "@/lib/tryout-volunteer-schedule"

export {
    EMPTY_SCHEDULE_BUNDLE,
    type EventPlaceholder,
    type MatchScheduleItem,
    type RefScheduleItem,
    type ScheduleItem,
    type SchedulePerson,
    type TryoutScheduleItem,
    type UserScheduleBundle,
    type VolunteerScheduleItem
} from "@/lib/schedule-item-types"

const pad2 = (n: number) => String(n).padStart(2, "0")
const hhmm = (t: { hour: number; minute: number }) =>
    `${pad2(t.hour)}:${pad2(t.minute)}`

function teamLabel(name: string | null, number: number | null): string {
    return name ?? (number !== null ? `Team ${number}` : "TBD")
}

/**
 * Start/end window for a placeholder night: the night's time slots narrowed
 * to the division's playing window (so a 6pm division doesn't get an 8:30pm
 * placeholder). Falls back to all slots, then to a single default match.
 */
export function placeholderWindow(
    slotStartTimes: string[],
    divisionMinutes: number[]
): { startTime: string; endTime: string } {
    const earliest = divisionMinutes.length
        ? Math.min(...divisionMinutes)
        : null
    const latest = divisionMinutes.length ? Math.max(...divisionMinutes) : null
    const narrowed =
        earliest !== null && latest !== null
            ? slotStartTimes.filter((s) => {
                  const { hour, minute } = parseTime(s)
                  const m = hour * 60 + minute
                  return m >= earliest && m <= latest
              })
            : slotStartTimes
    const effective = narrowed.length > 0 ? narrowed : slotStartTimes

    if (effective.length === 0) {
        return {
            startTime: "19:00",
            endTime: hhmm(addMinutes(19, 0, MATCH_DURATION_MINUTES))
        }
    }
    const first = parseTime(effective[0])
    const last = parseTime(effective[effective.length - 1])
    return {
        startTime: hhmm(first),
        endTime: hhmm(
            addMinutes(last.hour, last.minute, MATCH_DURATION_MINUTES)
        )
    }
}

/** Fallback whole-night window when an event has no time slots configured. */
const DEFAULT_NIGHT_WINDOW = { startTime: "19:00", endTime: "22:30" }

/**
 * The minutes-of-day a division's matches will occupy once the schedule is
 * generated, predicted from the generator's slot-selection convention
 * (buildRegularSeasonMatches): 4-team divisions play seasonTimes[1..2],
 * 6-team divisions play seasonTimes[0..2], with static fallbacks. Lets a
 * placeholder narrow post-draft before any matches exist.
 */
export function predictedDivisionMinutes(
    teamCount: number,
    seasonSlotTimes: string[]
): number[] {
    const four = teamCount <= 4
    const fallback = four ? FOUR_TEAM_TIMES : SIX_TEAM_TIMES
    const out: number[] = []
    for (let m = 0; m < fallback.length; m++) {
        const t = four
            ? seasonSlotTimes[m + 1] || fallback[m]
            : seasonSlotTimes[m] || fallback[m]
        if (!t) continue
        const { hour, minute } = parseTime(t)
        const mins = hour * 60 + minute
        if (mins > 0) out.push(mins)
    }
    return out
}

export async function getScheduleForUsers(
    userIds: string[],
    seasonId: number
): Promise<UserScheduleBundle> {
    const ids = Array.from(new Set(userIds))
    if (ids.length === 0 || !Number.isInteger(seasonId) || seasonId <= 0) {
        return EMPTY_SCHEDULE_BUNDLE
    }
    const idSet = new Set(ids)

    const originalUser = alias(users, "originalUser")

    const [
        peopleRows,
        [seasonRow],
        teamRows,
        roster,
        eventRows,
        matchRows,
        metaRows,
        subRows,
        pickupRows,
        refRows,
        w1Rows,
        w2Rows,
        w3Rows,
        volunteerAssignments,
        signupRows,
        unavailRows
    ] = await Promise.all([
        db
            .select({
                userId: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(users)
            .where(inArray(users.id, ids)),
        db
            .select({ year: seasons.year, season: seasons.season })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1),
        db
            .select({
                id: teams.id,
                name: teams.name,
                number: teams.number,
                divisionId: teams.division,
                divisionName: divisions.name
            })
            .from(teams)
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(eq(teams.season, seasonId)),
        getTeamRosterWithSubs(seasonId),
        db
            .select({
                id: seasonEvents.id,
                eventType: seasonEvents.event_type,
                eventDate: seasonEvents.event_date,
                sortOrder: seasonEvents.sort_order,
                label: seasonEvents.label
            })
            .from(seasonEvents)
            .where(eq(seasonEvents.season_id, seasonId))
            .orderBy(asc(seasonEvents.sort_order), asc(seasonEvents.id)),
        db
            .select({
                id: matches.id,
                week: matches.week,
                date: matches.date,
                time: matches.time,
                court: matches.court,
                playoff: matches.playoff,
                divisionId: matches.division,
                homeTeamId: matches.home_team,
                awayTeamId: matches.away_team
            })
            .from(matches)
            .where(eq(matches.season, seasonId)),
        db
            .select({
                matchId: playoffMatchesMeta.match_id,
                workTeamId: playoffMatchesMeta.work_team
            })
            .from(playoffMatchesMeta)
            .where(
                and(
                    eq(playoffMatchesMeta.season, seasonId),
                    isNotNull(playoffMatchesMeta.match_id)
                )
            ),
        db
            .select({
                matchId: matchSubstitutions.match,
                originalUserId: matchSubstitutions.original_user
            })
            .from(matchSubstitutions)
            .where(
                and(
                    eq(matchSubstitutions.season, seasonId),
                    inArray(matchSubstitutions.original_user, ids)
                )
            ),
        db
            .select({
                matchId: matchSubstitutions.match,
                subUserId: matchSubstitutions.sub_user,
                subTeamId: matchSubstitutions.team,
                originalUserId: originalUser.id,
                originalFirst: originalUser.first_name,
                originalLast: originalUser.last_name,
                originalPreferred: originalUser.preferred_name
            })
            .from(matchSubstitutions)
            .innerJoin(
                originalUser,
                eq(matchSubstitutions.original_user, originalUser.id)
            )
            .where(
                and(
                    eq(matchSubstitutions.season, seasonId),
                    inArray(matchSubstitutions.sub_user, ids)
                )
            ),
        db
            .select({
                refereeId: matchReferees.referee_id,
                matchId: matchReferees.match_id
            })
            .from(matchReferees)
            .where(
                and(
                    eq(matchReferees.season_id, seasonId),
                    inArray(matchReferees.referee_id, ids)
                )
            ),
        db
            .select({
                userId: week1Rosters.user,
                session: week1Rosters.session_number,
                court: week1Rosters.court_number
            })
            .from(week1Rosters)
            .where(eq(week1Rosters.season, seasonId)),
        db
            .select({
                userId: week2Rosters.user,
                teamNumber: week2Rosters.team_number,
                isCaptain: week2Rosters.is_captain,
                divisionName: divisions.name
            })
            .from(week2Rosters)
            .innerJoin(divisions, eq(week2Rosters.division, divisions.id))
            .where(eq(week2Rosters.season, seasonId)),
        db
            .select({
                userId: week3Rosters.user,
                teamNumber: week3Rosters.team_number,
                isCaptain: week3Rosters.is_captain,
                divisionName: divisions.name
            })
            .from(week3Rosters)
            .innerJoin(divisions, eq(week3Rosters.division, divisions.id))
            .where(eq(week3Rosters.season, seasonId)),
        getVolunteerAssignmentsForSeason(seasonId),
        db
            .select({ userId: signups.player })
            .from(signups)
            .where(
                and(eq(signups.season, seasonId), inArray(signups.player, ids))
            ),
        db
            .select({
                userId: userUnavailability.user_id,
                eventId: userUnavailability.event_id
            })
            .from(userUnavailability)
            .innerJoin(
                seasonEvents,
                eq(userUnavailability.event_id, seasonEvents.id)
            )
            .where(
                and(
                    eq(seasonEvents.season_id, seasonId),
                    inArray(userUnavailability.user_id, ids)
                )
            )
    ])

    const people = new Map<string, SchedulePerson>(
        peopleRows.map((p) => [p.userId, p])
    )
    const seasonLabel = seasonRow
        ? formatSeasonLabel({
              seasonName: seasonRow.season,
              seasonYear: seasonRow.year
          })
        : ""

    const teamById = new Map(teamRows.map((t) => [t.id, t]))
    const teamByUser = new Map<string, number>()
    for (const r of roster) {
        if (idSet.has(r.activeUser.id))
            teamByUser.set(r.activeUser.id, r.teamId)
    }

    const regularEvents = eventRows.filter(
        (e) => e.eventType === "regular_season"
    )
    regularEvents.sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    const tryoutEvents = eventRows.filter((e) => e.eventType === "tryout")
    const playoffEvents = eventRows.filter((e) => e.eventType === "playoff")

    const slotEventIds = [
        ...tryoutEvents,
        ...playoffEvents,
        ...regularEvents
    ].map((e) => e.id)
    const slotRows = slotEventIds.length
        ? await db
              .select({
                  eventId: eventTimeSlots.event_id,
                  startTime: eventTimeSlots.start_time
              })
              .from(eventTimeSlots)
              .where(inArray(eventTimeSlots.event_id, slotEventIds))
              .orderBy(asc(eventTimeSlots.sort_order), asc(eventTimeSlots.id))
        : []
    const slotsByEvent = new Map<number, string[]>()
    for (const s of slotRows) {
        const list = slotsByEvent.get(s.eventId) ?? []
        list.push(s.startTime)
        slotsByEvent.set(s.eventId, list)
    }

    const matchById = new Map(matchRows.map((m) => [m.id, m]))
    const workTeamByMatch = new Map<number, number>()
    for (const m of metaRows) {
        if (m.matchId !== null && m.workTeamId !== null) {
            workTeamByMatch.set(m.matchId, m.workTeamId)
        }
    }
    const subbedOutByUser = new Map<string, Set<number>>()
    for (const s of subRows) {
        const set = subbedOutByUser.get(s.originalUserId) ?? new Set()
        set.add(s.matchId)
        subbedOutByUser.set(s.originalUserId, set)
    }

    // Playoff rows are inserted with date "" when the night isn't configured
    // yet, so treat empty as unset. Regular-season rows fall back to the
    // week-indexed regular_season event date.
    const matchDate = (m: (typeof matchRows)[number]): string | null =>
        m.date ||
        (m.playoff ? null : (regularEvents[m.week - 1]?.eventDate ?? null))

    const items: ScheduleItem[] = []

    const pushMatch = (
        userId: string,
        m: (typeof matchRows)[number],
        role: "play" | "work",
        teamId: number,
        subbingFor: SchedulePerson | null
    ) => {
        const date = matchDate(m)
        if (!date) return
        const home = m.homeTeamId !== null ? teamById.get(m.homeTeamId) : null
        const away = m.awayTeamId !== null ? teamById.get(m.awayTeamId) : null
        const division = teamById.get(teamId)
        items.push({
            kind: "match",
            userId,
            date,
            startTime: m.time,
            endTime: null,
            court: m.court,
            matchId: m.id,
            role,
            playoff: m.playoff,
            week: m.week,
            divisionId: m.divisionId,
            divisionName:
                division?.divisionName ??
                home?.divisionName ??
                away?.divisionName ??
                "",
            teamId,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            homeName: teamLabel(home?.name ?? null, home?.number ?? null),
            awayName: teamLabel(away?.name ?? null, away?.number ?? null),
            subbingFor
        })
    }

    // Team matches (play) and playoff work duty.
    for (const [userId, teamId] of teamByUser) {
        const subbedOut = subbedOutByUser.get(userId)
        for (const m of matchRows) {
            if (m.playoff && (m.homeTeamId === null || m.awayTeamId === null)) {
                continue
            }
            if (m.homeTeamId === teamId || m.awayTeamId === teamId) {
                if (subbedOut?.has(m.id)) continue
                pushMatch(userId, m, "play", teamId, null)
            } else if (m.playoff && workTeamByMatch.get(m.id) === teamId) {
                pushMatch(userId, m, "work", teamId, null)
            }
        }
    }

    // One-off pickups where the person subs in for someone else.
    for (const p of pickupRows) {
        const m = matchById.get(p.matchId)
        if (!m) continue
        pushMatch(p.subUserId, m, "play", p.subTeamId, {
            userId: p.originalUserId,
            firstName: p.originalFirst,
            lastName: p.originalLast,
            preferredName: p.originalPreferred
        })
    }

    // Reffing.
    for (const r of refRows) {
        const m = matchById.get(r.matchId)
        if (!m) continue
        const date = matchDate(m)
        if (!date) continue
        const home = m.homeTeamId !== null ? teamById.get(m.homeTeamId) : null
        const away = m.awayTeamId !== null ? teamById.get(m.awayTeamId) : null
        items.push({
            kind: "ref",
            userId: r.refereeId,
            date,
            startTime: m.time,
            endTime: null,
            court: m.court,
            matchId: m.id,
            playoff: m.playoff,
            divisionName:
                home?.divisionName ??
                away?.divisionName ??
                teamRows.find((t) => t.divisionId === m.divisionId)
                    ?.divisionName ??
                "",
            homeName: teamLabel(home?.name ?? null, home?.number ?? null),
            awayName: teamLabel(away?.name ?? null, away?.number ?? null)
        })
    }

    // Tryouts.
    const pushTryout = (
        userId: string,
        weekIndex: number,
        session: number,
        court: number | null,
        sublabel: string | null
    ) => {
        const event = tryoutEvents[weekIndex]
        if (!event) return
        const slots = slotsByEvent.get(event.id) ?? []
        items.push({
            kind: "tryout",
            userId,
            date: event.eventDate,
            startTime: slots[session - 1] ?? null,
            endTime: slots[session] ?? null,
            court,
            eventId: event.id,
            tryoutNumber: weekIndex + 1,
            session,
            sublabel
        })
    }
    for (const r of w1Rows) {
        if (!idSet.has(r.userId)) continue
        pushTryout(r.userId, 0, r.session, r.court, null)
    }
    for (const [weekIndex, rows] of [
        [1, w2Rows],
        [2, w3Rows]
    ] as const) {
        for (const r of rows) {
            if (!idSet.has(r.userId)) continue
            pushTryout(
                r.userId,
                weekIndex,
                getSessionNumberFromTeam(r.teamNumber),
                LEGACY_COURT_BY_DIVISION[r.divisionName] ?? null,
                `${r.divisionName} Team ${r.teamNumber}${r.isCaptain ? " (captain)" : ""}`
            )
        }
    }

    // Tryout volunteer jobs.
    for (const a of volunteerAssignments) {
        if (!idSet.has(a.userId)) continue
        const slots = slotsByEvent.get(a.eventId) ?? []
        const allNight = isAllNightAssignment(a)
        let startTime: string | null
        let endTime: string | null
        if (allNight) {
            startTime = slots[0] ?? null
            if (slots.length > 0) {
                const last = parseTime(slots[slots.length - 1])
                endTime = hhmm(
                    addMinutes(last.hour, last.minute, MATCH_DURATION_MINUTES)
                )
            } else {
                endTime = null
            }
        } else {
            startTime = a.startTime
            const idx = a.startTime ? slots.indexOf(a.startTime) : -1
            endTime = idx >= 0 ? (slots[idx + 1] ?? null) : null
        }
        items.push({
            kind: "volunteer",
            userId: a.userId,
            date: a.eventDate,
            startTime,
            endTime,
            court: a.courtNumber,
            assignmentId: a.assignmentId,
            eventId: a.eventId,
            tryoutNumber: a.ordinal,
            jobName: a.jobName,
            allNight,
            courtNumber: a.courtNumber
        })
    }

    // Placeholders: one tentative hold per known season night (tryouts,
    // regular-season weeks, playoff weeks) for every signed-up person,
    // suppressed as real assignments, posted rosters, the draft, or the
    // person's own unavailability resolve each night. See EventPlaceholder.
    const placeholders: EventPlaceholder[] = []
    const signedUp = new Set(signupRows.map((r) => r.userId))
    if (signedUp.size > 0) {
        const unavailable = new Set(
            unavailRows.map((r) => `${r.userId}|${r.eventId}`)
        )
        // Any team roster for the season means the draft has happened:
        // signed-up players without a team no longer expect game nights.
        const teamsExist = roster.length > 0
        const rosterPostedByWeek = [
            w1Rows.length > 0,
            w2Rows.length > 0,
            w3Rows.length > 0
        ]
        const seasonSlots = regularEvents.length
            ? (slotsByEvent.get(regularEvents[0].id) ?? [])
            : []

        // Minutes-of-day each division actually plays (posted matches) and
        // is predicted to play (generator convention + team count), unioned
        // so narrowing works both before and after schedule generation.
        const divisionMinutes = new Map<number, number[]>()
        for (const m of matchRows) {
            if (m.playoff || !m.time) continue
            const { hour, minute } = parseTime(m.time)
            const mins = hour * 60 + minute
            if (mins <= 0) continue
            const list = divisionMinutes.get(m.divisionId) ?? []
            list.push(mins)
            divisionMinutes.set(m.divisionId, list)
        }
        const teamCountByDivision = new Map<number, number>()
        for (const t of teamRows) {
            teamCountByDivision.set(
                t.divisionId,
                (teamCountByDivision.get(t.divisionId) ?? 0) + 1
            )
        }
        const minutesForDivision = (divisionId: number): number[] => [
            ...(divisionMinutes.get(divisionId) ?? []),
            ...predictedDivisionMinutes(
                teamCountByDivision.get(divisionId) ?? 6,
                seasonSlots
            )
        ]

        // Nights already resolved by real items.
        const playoffResolved = new Set<string>()
        const regularPlayDates = new Set<string>()
        const volunteerEvents = new Set<string>()
        const weeksByTeam = new Map<number, Set<number>>()
        for (const i of items) {
            if (i.kind === "match") {
                if (i.playoff) playoffResolved.add(`${i.userId}|${i.date}`)
                else if (i.role === "play")
                    regularPlayDates.add(`${i.userId}|${i.date}`)
            } else if (i.kind === "volunteer") {
                volunteerEvents.add(`${i.userId}|${i.eventId}`)
            }
        }
        for (const m of matchRows) {
            if (m.playoff) continue
            for (const teamId of [m.homeTeamId, m.awayTeamId]) {
                if (teamId === null) continue
                const set = weeksByTeam.get(teamId) ?? new Set()
                set.add(m.week)
                weeksByTeam.set(teamId, set)
            }
        }

        const wholeNight = (slots: string[]) => {
            if (slots.length === 0) return DEFAULT_NIGHT_WINDOW
            const last = parseTime(slots[slots.length - 1])
            return {
                startTime: hhmm(parseTime(slots[0])),
                endTime: hhmm(
                    addMinutes(last.hour, last.minute, MATCH_DURATION_MINUTES)
                )
            }
        }

        for (const userId of signedUp) {
            const teamId = teamByUser.get(userId)
            const team =
                teamId !== undefined ? (teamById.get(teamId) ?? null) : null

            // Tryout nights: held until that week's roster is posted (roster
            // members get their real session as an item instead; everyone
            // else is not playing that night).
            for (const [idx, event] of tryoutEvents.entries()) {
                if (unavailable.has(`${userId}|${event.id}`)) continue
                if (rosterPostedByWeek[idx]) continue
                if (volunteerEvents.has(`${userId}|${event.id}`)) continue
                const window = wholeNight(slotsByEvent.get(event.id) ?? [])
                placeholders.push({
                    userId,
                    eventId: event.id,
                    date: event.eventDate,
                    eventType: "tryout",
                    ordinal: idx + 1,
                    ...window,
                    divisionId: null,
                    divisionName: null,
                    label: event.label,
                    stage: 0
                })
            }

            // Regular-season nights. Suppression is by the team's scheduled
            // week (not date) so subbed-out and rescheduled matches don't
            // resurrect the night; pickups suppress by date.
            for (const [idx, event] of regularEvents.entries()) {
                if (unavailable.has(`${userId}|${event.id}`)) continue
                if (teamsExist && !team) continue
                if (
                    teamId !== undefined &&
                    weeksByTeam.get(teamId)?.has(idx + 1)
                )
                    continue
                if (regularPlayDates.has(`${userId}|${event.eventDate}`))
                    continue
                const window = seasonSlots.length
                    ? placeholderWindow(
                          seasonSlots,
                          team ? minutesForDivision(team.divisionId) : []
                      )
                    : DEFAULT_NIGHT_WINDOW
                placeholders.push({
                    userId,
                    eventId: event.id,
                    date: event.eventDate,
                    eventType: "regular_season",
                    ordinal: idx + 1,
                    ...window,
                    divisionId: team?.divisionId ?? null,
                    divisionName: team?.divisionName ?? null,
                    label: event.label,
                    stage: team ? 1 : 0
                })
            }

            // Playoff nights: as before, cleared by a real playoff match
            // (play or work) on that date. Playoff events often have no time
            // slots of their own, so borrow the shared regular-season list.
            for (const [idx, event] of playoffEvents.entries()) {
                if (unavailable.has(`${userId}|${event.id}`)) continue
                if (teamsExist && !team) continue
                if (playoffResolved.has(`${userId}|${event.eventDate}`))
                    continue
                const eventSlots = slotsByEvent.get(event.id) ?? []
                const basis = eventSlots.length ? eventSlots : seasonSlots
                const window = basis.length
                    ? placeholderWindow(
                          basis,
                          team ? minutesForDivision(team.divisionId) : []
                      )
                    : DEFAULT_NIGHT_WINDOW
                placeholders.push({
                    userId,
                    eventId: event.id,
                    date: event.eventDate,
                    eventType: "playoff",
                    ordinal: idx + 1,
                    ...window,
                    divisionId: team?.divisionId ?? null,
                    divisionName: team?.divisionName ?? null,
                    label: event.label,
                    stage: team ? 1 : 0
                })
            }
        }
    }

    return {
        items,
        placeholders,
        people,
        seasonLabel,
        seasonYear: seasonRow?.year ?? null
    }
}
