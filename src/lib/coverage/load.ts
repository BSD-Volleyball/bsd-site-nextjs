/**
 * load.ts — server-side data loading for Coverage. Reads the newest season,
 * ALL of its regular-season and playoff nights (needed so buildCoverage can
 * number ordinals correctly), the admin/leadership schedules, and only the
 * matches/presence rows that fall within the requested date range, then
 * hands everything to the pure buildCoverage().
 */

import "server-only"

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm"

import { db } from "@/database/db"
import {
    coveragePresence,
    individual_divisions,
    matches,
    seasonEvents,
    seasons,
    teams,
    userRoles,
    users,
    userUnavailability
} from "@/database/schema"
import { getRecipientsWithRole } from "@/lib/rbac"
import { getScheduleForUsers } from "@/lib/schedule-items"
import {
    type BuildCoverageInput,
    type CoachInput,
    type CoverageEventInput,
    type CoverageMatchInput,
    buildCoverage
} from "./build"
import type { CoverageAdmin, CoverageDate } from "./types"

export async function loadCoverage(opts: {
    fromDate: string
    toDate?: string
}): Promise<CoverageDate[]> {
    const [season] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(1)
    if (!season) return []

    const allEvents = await db
        .select({
            id: seasonEvents.id,
            eventType: seasonEvents.event_type,
            eventDate: seasonEvents.event_date,
            label: seasonEvents.label
        })
        .from(seasonEvents)
        .where(eq(seasonEvents.season_id, season.id))
        .orderBy(asc(seasonEvents.event_date), asc(seasonEvents.sort_order))

    // Regular-season events in date order: index = week - 1, as in
    // schedule-items.ts, for matches whose date column is null.
    const regularEvents = allEvents.filter(
        (e) => e.eventType === "regular_season"
    )

    const inRange = (d: string) =>
        d >= opts.fromDate && (opts.toDate === undefined || d <= opts.toDate)

    // events is built from ALL regular_season/playoff nights of the season,
    // not just those in [fromDate, toDate]: buildCoverage assigns the
    // "Week N" / "Playoffs Week N" ordinal by counting from the season's
    // first night of each type, and skips any date with zero matches. If we
    // pre-filtered events to the requested range, the first in-range night
    // would always be relabeled "Week 1" regardless of its real position in
    // the season. Filtering is instead applied to which dates' matches and
    // presence rows are passed through, via rangeDates below.
    const events: CoverageEventInput[] = allEvents
        .filter(
            (e) => e.eventType === "regular_season" || e.eventType === "playoff"
        )
        .map((e) => ({
            eventId: e.id,
            date: e.eventDate,
            eventType: e.eventType as "regular_season" | "playoff",
            label: e.label
        }))

    const rangeDates = new Set(
        events.filter((e) => inRange(e.date)).map((e) => e.date)
    )
    if (rangeDates.size === 0) return []

    const matchRows = await db
        .select({
            id: matches.id,
            date: matches.date,
            time: matches.time,
            week: matches.week,
            playoff: matches.playoff,
            homeTeam: matches.home_team,
            awayTeam: matches.away_team
        })
        .from(matches)
        .where(eq(matches.season, season.id))

    const slotMatches: CoverageMatchInput[] = []
    const inRangeMatches: (typeof matchRows)[number][] = []
    const matchDateById = new Map<number, string>()
    for (const m of matchRows) {
        const date =
            m.date ||
            (m.playoff ? null : (regularEvents[m.week - 1]?.eventDate ?? null))
        if (!date || !rangeDates.has(date)) continue
        slotMatches.push({ matchId: m.id, date, startTime: m.time })
        inRangeMatches.push(m)
        matchDateById.set(m.id, date)
    }

    // Coach derivation: a team's captain/captain2 in a coaches-mode division
    // (individual_divisions.coaches = true) are its coaches. Coaches are
    // usually not on the draft roster, so getScheduleForUsers emits no item
    // for them; coverage derives it here from the match's teams.
    const coachedTeamRows = await db
        .select({
            id: teams.id,
            captain: teams.captain,
            captain2: teams.captain2
        })
        .from(teams)
        .innerJoin(
            individual_divisions,
            and(
                eq(individual_divisions.season, teams.season),
                eq(individual_divisions.division, teams.division)
            )
        )
        .where(
            and(
                eq(teams.season, season.id),
                eq(individual_divisions.coaches, true)
            )
        )
    const coachesByTeam = new Map<number, string[]>()
    for (const row of coachedTeamRows) {
        const coaches = [row.captain, row.captain2].filter(
            (c): c is string => c !== null
        )
        coachesByTeam.set(row.id, coaches)
    }

    const [admins, leadership] = await Promise.all([
        getRecipientsWithRole("admin"),
        getRecipientsWithRole("leadership_group")
    ])
    const adminIds = new Set(admins.map((a) => a.userId))
    const leadershipIds = new Set(leadership.map((l) => l.userId))
    const presenceRows = await db
        .select({
            id: coveragePresence.id,
            userId: coveragePresence.user_id,
            date: coveragePresence.event_date,
            slotTime: coveragePresence.slot_time,
            note: coveragePresence.note
        })
        .from(coveragePresence)
        .where(
            opts.toDate === undefined
                ? gte(coveragePresence.event_date, opts.fromDate)
                : and(
                      gte(coveragePresence.event_date, opts.fromDate),
                      lte(coveragePresence.event_date, opts.toDate)
                  )
        )
    const userIds = [
        ...new Set([
            ...adminIds,
            ...leadershipIds,
            ...presenceRows.map((p) => p.userId)
        ])
    ]
    const userIdSet = new Set(userIds)

    // Coaches not already in the admin/leadership pool are irrelevant to
    // coverage and must not be added to userIds.
    const coaching: CoachInput[] = []
    for (const m of inRangeMatches) {
        const date = matchDateById.get(m.id)
        if (!date) continue
        for (const teamId of [m.homeTeam, m.awayTeam]) {
            if (teamId === null) continue
            for (const userId of coachesByTeam.get(teamId) ?? []) {
                if (!userIdSet.has(userId)) continue
                coaching.push({ userId, date, startTime: m.time })
            }
        }
    }

    const bundle = await getScheduleForUsers(userIds, season.id)

    // Unavailability is only needed for in-range nights: out-of-range events
    // are dropped by buildCoverage anyway (they have no matches passed in).
    const eventIds = events
        .filter((e) => rangeDates.has(e.date))
        .map((e) => e.eventId)
    const unavailRows =
        userIds.length && eventIds.length
            ? await db
                  .select({
                      userId: userUnavailability.user_id,
                      eventId: userUnavailability.event_id
                  })
                  .from(userUnavailability)
                  .where(
                      and(
                          inArray(userUnavailability.user_id, userIds),
                          inArray(userUnavailability.event_id, eventIds)
                      )
                  )
            : []

    const input: BuildCoverageInput = {
        events,
        matches: slotMatches,
        items: bundle.items,
        presence: presenceRows.filter((p) => rangeDates.has(p.date)),
        coaching,
        unavailable: new Set(
            unavailRows.map((r) => `${r.userId}|${r.eventId}`)
        ),
        people: bundle.people,
        adminIds,
        leadershipIds
    }
    return buildCoverage(input)
}

/**
 * Admin and leadership_group role holders, for the "add presence" picker.
 * Deduped by user id; a user with both roles is treated as an admin
 * (`isLeadership: false`) since admin already grants full counting.
 */
export async function listPresencePool(): Promise<CoverageAdmin[]> {
    const rows = await db
        .select({
            userId: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            role: userRoles.role
        })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.user_id, users.id))
        .where(inArray(userRoles.role, ["admin", "leadership_group"]))
    const byId = new Map<string, CoverageAdmin>()
    for (const r of rows) {
        const isAdminRow = r.role === "admin"
        const existing = byId.get(r.userId)
        if (existing) {
            if (isAdminRow) existing.isLeadership = false
            continue
        }
        byId.set(r.userId, {
            userId: r.userId,
            name: `${r.preferredName || r.firstName} ${r.lastName}`.trim(),
            isLeadership: !isAdminRow
        })
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}
