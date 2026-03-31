import { NextResponse } from "next/server"
import { and, asc, eq, inArray, or } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    divisions,
    drafts,
    eventTimeSlots,
    matches,
    playoffMatchesMeta,
    seasonEvents,
    seasons,
    teams,
    users
} from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import {
    type CalendarEvent,
    VENUE_LOCATION,
    addMinutes,
    buildICalendar,
    parseTime
} from "@/lib/generate-ical"

export const runtime = "nodejs"

const MATCH_DURATION_MINUTES = 90

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return NextResponse.json(
            { error: "Not authenticated" },
            { status: 401 }
        )
    }

    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return NextResponse.json({ error: "No active season" }, { status: 404 })
    }

    const seasonId = config.seasonId
    const userId = session.user.id

    // Get user info for display name
    const [userRow] = await db
        .select({
            firstName: users.first_name,
            preferredName: users.preferred_name
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    if (!userRow) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const playerName = userRow.preferredName || userRow.firstName

    // Get user's team for this season
    const [userDraftRow] = await db
        .select({
            teamId: teams.id,
            teamName: teams.name,
            teamNumber: teams.number,
            divisionId: teams.division
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .where(and(eq(drafts.user, userId), eq(teams.season, seasonId)))
        .limit(1)

    if (!userDraftRow) {
        return NextResponse.json(
            { error: "You are not on a team this season" },
            { status: 404 }
        )
    }

    const { teamId, divisionId } = userDraftRow

    // Get season label and division name
    const [[seasonRow], [divisionRow]] = await Promise.all([
        db
            .select({ year: seasons.year, season: seasons.season })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1),
        db
            .select({ name: divisions.name })
            .from(divisions)
            .where(eq(divisions.id, divisionId))
            .limit(1)
    ])

    if (!seasonRow) {
        return NextResponse.json({ error: "Season not found" }, { status: 404 })
    }

    const seasonLabel = `${seasonRow.season.charAt(0).toUpperCase() + seasonRow.season.slice(1)} ${seasonRow.year}`

    // Get all teams in the season (for name lookups)
    const teamRows = await db
        .select({
            id: teams.id,
            name: teams.name,
            number: teams.number
        })
        .from(teams)
        .where(eq(teams.season, seasonId))

    const teamById = new Map(teamRows.map((t) => [t.id, t]))

    // Get regular season matches for the user's team
    const userMatches = await db
        .select({
            id: matches.id,
            week: matches.week,
            date: matches.date,
            time: matches.time,
            court: matches.court,
            homeTeamId: matches.home_team,
            awayTeamId: matches.away_team
        })
        .from(matches)
        .where(
            and(
                eq(matches.season, seasonId),
                eq(matches.playoff, false),
                or(eq(matches.home_team, teamId), eq(matches.away_team, teamId))
            )
        )

    // Get playoff season events and their time slots
    const playoffEvents = await db
        .select({
            id: seasonEvents.id,
            eventDate: seasonEvents.event_date,
            sortOrder: seasonEvents.sort_order,
            label: seasonEvents.label
        })
        .from(seasonEvents)
        .where(
            and(
                eq(seasonEvents.season_id, seasonId),
                eq(seasonEvents.event_type, "playoff")
            )
        )
        .orderBy(asc(seasonEvents.sort_order))

    const playoffTimeSlotsByEvent = new Map<
        number,
        Array<{ startTime: string; sortOrder: number }>
    >()
    if (playoffEvents.length > 0) {
        const playoffEventIds = playoffEvents.map((e) => e.id)
        const slots = await db
            .select({
                eventId: eventTimeSlots.event_id,
                startTime: eventTimeSlots.start_time,
                sortOrder: eventTimeSlots.sort_order
            })
            .from(eventTimeSlots)
            .where(inArray(eventTimeSlots.event_id, playoffEventIds))
            .orderBy(asc(eventTimeSlots.sort_order))

        for (const slot of slots) {
            const arr = playoffTimeSlotsByEvent.get(slot.eventId) ?? []
            arr.push({
                startTime: slot.startTime,
                sortOrder: slot.sortOrder
            })
            playoffTimeSlotsByEvent.set(slot.eventId, arr)
        }
    }

    // Build calendar events
    const calendarEvents: CalendarEvent[] = []
    const pad2 = (n: number) => String(n).padStart(2, "0")

    // Regular season matches
    for (const match of userMatches) {
        if (!match.date) continue

        const homeTeam = match.homeTeamId
            ? teamById.get(match.homeTeamId)
            : null
        const awayTeam = match.awayTeamId
            ? teamById.get(match.awayTeamId)
            : null

        const homeName = homeTeam?.name ?? "TBD"
        const awayName = awayTeam?.name ?? "TBD"

        const summary = `BSD: ${homeName} vs ${awayName} (${playerName})`

        const dateStr = match.date.replace(/-/g, "")

        let startHour = 19
        let startMinute = 0

        if (match.time) {
            const normalised = parseTime(match.time)
            startHour = normalised.hour
            startMinute = normalised.minute
        }

        const end = addMinutes(startHour, startMinute, MATCH_DURATION_MINUTES)

        const descriptionParts = [
            `${seasonLabel} – ${divisionRow?.name ?? ""}`,
            `Week ${match.week}`,
            `${homeName} vs ${awayName}`
        ]
        if (match.court) {
            descriptionParts.push(`Court ${match.court}`)
        }

        calendarEvents.push({
            uid: `bsd-match-${match.id}@bsd-volleyball.com`,
            summary,
            description: descriptionParts.join("\n"),
            location: VENUE_LOCATION,
            dateStr,
            startTime: `${pad2(startHour)}:${pad2(startMinute)}`,
            endTime: `${pad2(end.hour)}:${pad2(end.minute)}`
        })
    }

    // Determine which playoff weeks apply to the user's division.
    // playoff_matches_meta stores per-division bracket weeks; if it has
    // no rows yet (bracket not set up), fall back to all playoff events.
    const divisionPlayoffMetaRows = await db
        .select({ week: playoffMatchesMeta.week })
        .from(playoffMatchesMeta)
        .where(
            and(
                eq(playoffMatchesMeta.season, seasonId),
                eq(playoffMatchesMeta.division, divisionId)
            )
        )

    const divisionPlayoffWeeks = new Set(
        divisionPlayoffMetaRows.map((r) => r.week)
    )

    // playoff season_events are ordered by sort_order; sort_order == bracket week number
    const applicablePlayoffEvents =
        divisionPlayoffWeeks.size > 0
            ? playoffEvents.filter((e) => divisionPlayoffWeeks.has(e.sortOrder))
            : playoffEvents

    // Playoff placeholder events
    for (const event of applicablePlayoffEvents) {
        const dateStr = event.eventDate.replace(/-/g, "")
        const weekNum = event.sortOrder

        const slots = playoffTimeSlotsByEvent.get(event.id) ?? []

        let startHour = 19
        let startMinute = 0
        let endHour: number
        let endMinute: number

        if (slots.length > 0) {
            // Earliest slot → start; latest slot start + match duration → end
            const first = parseTime(slots[0].startTime)
            startHour = first.hour
            startMinute = first.minute

            const last = parseTime(slots[slots.length - 1].startTime)
            const lastEnd = addMinutes(
                last.hour,
                last.minute,
                MATCH_DURATION_MINUTES
            )
            endHour = lastEnd.hour
            endMinute = lastEnd.minute
        } else {
            const end = addMinutes(
                startHour,
                startMinute,
                MATCH_DURATION_MINUTES
            )
            endHour = end.hour
            endMinute = end.minute
        }

        calendarEvents.push({
            uid: `bsd-playoff-wk${weekNum}-s${seasonId}@bsd-volleyball.com`,
            summary: `BSD: Playoff Week ${weekNum} (${playerName})`,
            description: [
                `${seasonLabel} Playoffs – ${divisionRow?.name ?? ""}`,
                `Playoff Week ${weekNum}`,
                event.label ?? "",
                "Exact match time TBD"
            ]
                .filter(Boolean)
                .join("\n"),
            location: VENUE_LOCATION,
            dateStr,
            startTime: `${pad2(startHour)}:${pad2(startMinute)}`,
            endTime: `${pad2(endHour)}:${pad2(endMinute)}`
        })
    }

    // Sort events by date then start time
    calendarEvents.sort((a, b) => {
        const dateCmp = a.dateStr.localeCompare(b.dateStr)
        if (dateCmp !== 0) return dateCmp
        return a.startTime.localeCompare(b.startTime)
    })

    const icsContent = buildICalendar(calendarEvents)
    const filename = `bsd-schedule-${seasonLabel.toLowerCase().replace(/\s+/g, "-")}.ics`

    return new NextResponse(icsContent, {
        status: 200,
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`
        }
    })
}
