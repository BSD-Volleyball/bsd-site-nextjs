"use server"

import { db } from "@/database/db"
import { auth } from "@/lib/auth"
import {
    users,
    teams,
    drafts,
    signups,
    seasonEvents,
    userUnavailability,
    divisions,
    seasons,
    matches
} from "@/database/schema"
import { eq, and, inArray, or, asc, desc } from "drizzle-orm"
import { headers } from "next/headers"
import { getSeasonConfig } from "@/lib/site-config"
import { isAdminOrDirectorBySession } from "@/lib/rbac"

export type SeasonInfo = {
    id: number
    year: number
    name: string
}

export type EventInfo = {
    id: number
    eventDate: string
    eventType: "regular_season" | "playoff"
    sortOrder: number
    label: string | null
}

export type RosterPlayer = {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    signupId: number
    unavailableEventIds: number[]
    male: boolean | null
}

export type TeamOption = {
    id: number
    name: string
    number: number | null
    divisionName: string
}

export type TeamAvailabilityData = {
    status: true
    isAdmin: boolean
    team: TeamOption
    allTeams: TeamOption[]
    events: EventInfo[]
    roster: RosterPlayer[]
    allSeasons: SeasonInfo[]
    playerPicUrl: string
    teamMatchTimeByEventDate: Record<string, string | null>
}

export type TeamAvailabilityError = {
    status: false
    message: string
    isAdmin?: boolean
    allTeams?: TeamOption[]
}

export type TeamAvailabilityResult =
    | TeamAvailabilityData
    | TeamAvailabilityError

export async function getAllSeasonTeams(): Promise<TeamOption[]> {
    const config = await getSeasonConfig()
    if (!config.seasonId) return []

    const rows = await db
        .select({
            id: teams.id,
            name: teams.name,
            number: teams.number,
            divisionName: divisions.name
        })
        .from(teams)
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .where(eq(teams.season, config.seasonId))
        .orderBy(asc(divisions.level), asc(teams.number))

    return rows
}

export async function getTeamAvailabilityData(
    teamId?: number
): Promise<TeamAvailabilityResult> {
    const session = await auth.api.getSession({
        headers: await headers()
    })
    if (!session?.user) {
        return { status: false, message: "Not authenticated." }
    }

    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return { status: false, message: "No active season configured." }
    }

    const isAdmin = await isAdminOrDirectorBySession()

    // Find teams for the current season with captain info
    const allTeamRows = await db
        .select({
            id: teams.id,
            name: teams.name,
            number: teams.number,
            divisionName: divisions.name,
            captain: teams.captain,
            captain2: teams.captain2
        })
        .from(teams)
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .where(eq(teams.season, config.seasonId))
        .orderBy(asc(divisions.level), asc(teams.number))

    const toOption = ({
        captain,
        captain2,
        ...rest
    }: (typeof allTeamRows)[number]): TeamOption => rest

    let availableTeams: TeamOption[]
    if (isAdmin) {
        availableTeams = allTeamRows.map(toOption)
    } else {
        availableTeams = allTeamRows
            .filter(
                (t) =>
                    t.captain === session.user.id ||
                    t.captain2 === session.user.id
            )
            .map(toOption)
    }

    if (availableTeams.length === 0) {
        return {
            status: false,
            message: "You are not a captain or coach of any team this season.",
            isAdmin,
            allTeams: isAdmin ? allTeamRows.map(toOption) : undefined
        }
    }

    // Determine which team to show
    let selectedTeam: TeamOption | undefined
    if (teamId) {
        selectedTeam = availableTeams.find((t) => t.id === teamId)
    } else if (isAdmin) {
        // If the admin is also a captain, default to their own team
        const captainRow = allTeamRows.find(
            (t) =>
                t.captain === session.user.id || t.captain2 === session.user.id
        )
        selectedTeam = captainRow
            ? (availableTeams.find((t) => t.id === captainRow.id) ??
              availableTeams[0])
            : availableTeams[0]
    } else {
        selectedTeam = availableTeams[0]
    }

    if (!selectedTeam) {
        return {
            status: false,
            message: "Team not found or you do not have access.",
            isAdmin,
            allTeams: isAdmin ? allTeamRows.map(toOption) : undefined
        }
    }

    // Get roster: drafts joined with users and signups
    const rosterRows = await db
        .select({
            userId: drafts.user,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            male: users.male,
            signupId: signups.id,
            round: drafts.round,
            overall: drafts.overall
        })
        .from(drafts)
        .innerJoin(users, eq(drafts.user, users.id))
        .innerJoin(
            signups,
            and(
                eq(signups.player, drafts.user),
                eq(signups.season, config.seasonId)
            )
        )
        .where(eq(drafts.team, selectedTeam.id))
        .orderBy(asc(drafts.round), asc(drafts.overall))

    // Get season events (regular_season + playoff)
    const events = await db
        .select({
            id: seasonEvents.id,
            eventDate: seasonEvents.event_date,
            eventType: seasonEvents.event_type,
            sortOrder: seasonEvents.sort_order,
            label: seasonEvents.label
        })
        .from(seasonEvents)
        .where(
            and(
                eq(seasonEvents.season_id, config.seasonId),
                inArray(seasonEvents.event_type, ["regular_season", "playoff"])
            )
        )
        .orderBy(asc(seasonEvents.sort_order))

    // Get unavailability for all roster signups
    const signupIds = rosterRows.map((r) => r.signupId)
    let unavailabilityRows: { signupId: number | null; eventId: number }[] = []
    if (signupIds.length > 0) {
        unavailabilityRows = await db
            .select({
                signupId: userUnavailability.signup_id,
                eventId: userUnavailability.event_id
            })
            .from(userUnavailability)
            .where(inArray(userUnavailability.signup_id, signupIds))
    }

    // Build unavailability lookup: signupId -> Set of eventIds
    const unavailBySignup = new Map<number, Set<number>>()
    for (const row of unavailabilityRows) {
        if (!unavailBySignup.has(row.signupId!)) {
            unavailBySignup.set(row.signupId!, new Set())
        }
        unavailBySignup.get(row.signupId!)!.add(row.eventId)
    }

    const roster: RosterPlayer[] = rosterRows.map((r) => ({
        userId: r.userId,
        firstName: r.firstName,
        lastName: r.lastName,
        preferredName: r.preferredName,
        male: r.male,
        signupId: r.signupId,
        unavailableEventIds: Array.from(unavailBySignup.get(r.signupId) ?? [])
    }))

    const allSeasonRows = await db
        .select({ id: seasons.id, year: seasons.year, season: seasons.season })
        .from(seasons)
        .orderBy(desc(seasons.id))

    const allSeasons: SeasonInfo[] = allSeasonRows.map((s) => ({
        id: s.id,
        year: s.year,
        name: s.season
    }))

    // Fetch team's match times so captains can see when they play on each date
    const teamMatchRows = await db
        .select({ date: matches.date, time: matches.time })
        .from(matches)
        .where(
            and(
                eq(matches.season, config.seasonId),
                or(
                    eq(matches.home_team, selectedTeam.id),
                    eq(matches.away_team, selectedTeam.id)
                )
            )
        )

    const teamMatchTimeByEventDate: Record<string, string | null> = {}
    for (const m of teamMatchRows) {
        if (m.date) teamMatchTimeByEventDate[m.date] = m.time ?? null
    }

    return {
        status: true,
        isAdmin,
        team: selectedTeam,
        allTeams: availableTeams,
        events: events as EventInfo[],
        roster,
        allSeasons,
        playerPicUrl: process.env.PLAYER_PIC_URL ?? "",
        teamMatchTimeByEventDate
    }
}
