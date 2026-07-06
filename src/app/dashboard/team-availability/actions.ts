"use server"

import { db } from "@/database/db"
import { auth } from "@/lib/auth"
import {
    teams,
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
import {
    isAdminOrDirectorBySession,
    getCommissionerDivisionScope
} from "@/lib/rbac"
import {
    getTeamRosterWithSubs,
    getMatchSubsForTeamSeason,
    formatPlayerSummaryName,
    type MatchSubEntry
} from "@/lib/roster"

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
    // When this player has been permanently subbed out, this points to who
    // replaced them. Subbed-out players are kept in the roster array so the
    // UI can render the "Subbed out — Round X" annotation.
    isSubbedOut?: boolean
    subbedOutAt?: string | null
    // When this player is here as a permanent sub, this records the original
    // draftee they are filling in for and the original draft round/overall.
    subForOriginalUserId?: string
    subForOriginalName?: string
    originalRound?: number
    originalOverall?: number
}

export type DateMatchInfo = {
    matchId: number | null
    matchTime: string | null
    regularSubs: { originalName: string; subName: string }[]
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
    // Per-event-date: matchId, time, and any regular subs already recorded.
    // Used so the panel can pass matchId to lockInRegularSub and the matrix
    // can annotate cells.
    dateMatchInfo: Record<string, DateMatchInfo>
    // True when viewer can lock in a permanent sub for this team (admin or
    // commissioner of the team's division).
    canLockInPermanent: boolean
    // True when viewer can see the full waitlist dropdown — same gate as
    // canLockInPermanent. Captains do not see it.
    canSeeFullWaitlist: boolean
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
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return []

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
    const commissionerScope = await getCommissionerDivisionScope(
        session.user.id,
        config.seasonId
    )
    const isLeagueWideCommissioner =
        !isAdmin && commissionerScope.type === "league_wide"
    const scopedDivisionIds =
        commissionerScope.type === "division_specific"
            ? commissionerScope.divisionIds
            : null

    // Find teams for the current season with captain info
    const allTeamRows = await db
        .select({
            id: teams.id,
            name: teams.name,
            number: teams.number,
            divisionName: divisions.name,
            division: teams.division,
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
        division: _division,
        ...rest
    }: (typeof allTeamRows)[number]): TeamOption => rest

    let availableTeams: TeamOption[]
    if (isAdmin || isLeagueWideCommissioner) {
        availableTeams = allTeamRows.map(toOption)
    } else if (scopedDivisionIds) {
        const seen = new Set<number>()
        availableTeams = allTeamRows
            .filter((t) => {
                const include =
                    t.captain === session.user.id ||
                    t.captain2 === session.user.id ||
                    scopedDivisionIds.includes(t.division)
                if (include && !seen.has(t.id)) {
                    seen.add(t.id)
                    return true
                }
                return false
            })
            .map(toOption)
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
            message:
                "You do not have access to any team availability this season.",
            isAdmin,
            allTeams: isAdmin ? allTeamRows.map(toOption) : undefined
        }
    }

    // Determine which team to show; admins and commissioners prefer their
    // own captained team (if any) to avoid landing on an arbitrary team
    let selectedTeam: TeamOption | undefined
    if (teamId) {
        selectedTeam = availableTeams.find((t) => t.id === teamId)
    } else if (commissionerScope.type !== "denied" || isAdmin) {
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
            message: "Team not found or you do not have access to it.",
            isAdmin,
            allTeams: isAdmin ? allTeamRows.map(toOption) : undefined
        }
    }

    // Get roster with permanent-sub awareness.
    const rosterEntries = await getTeamRosterWithSubs(
        config.seasonId,
        selectedTeam.id
    )

    // Pull signup ids for the active player on each slot (for unavailability
    // lookup) AND for any subbed-out original who still has a signup row.
    const slotActiveUserIds = rosterEntries.map((e) => e.activeUser.id)
    const slotOriginalUserIds = rosterEntries.map((e) => e.originalUser.id)
    const allRelevantUserIds = Array.from(
        new Set([...slotActiveUserIds, ...slotOriginalUserIds])
    )

    const signupRows = allRelevantUserIds.length
        ? await db
              .select({ id: signups.id, player: signups.player })
              .from(signups)
              .where(
                  and(
                      eq(signups.season, config.seasonId),
                      inArray(signups.player, allRelevantUserIds)
                  )
              )
        : []
    const signupIdByUser = new Map<string, number>()
    for (const r of signupRows) signupIdByUser.set(r.player, r.id)

    // Build flat roster: one row per draft slot for the active player, plus
    // an extra row for each subbed-out original so the UI can show them.
    type Built = {
        active: RosterPlayer
        out?: RosterPlayer
    }
    const built: Built[] = rosterEntries.map((e) => {
        const isSubbed = e.chain.length > 0
        const activeSignupId = signupIdByUser.get(e.activeUser.id) ?? -1
        const active: RosterPlayer = {
            userId: e.activeUser.id,
            firstName: e.activeUser.firstName,
            lastName: e.activeUser.lastName,
            preferredName: e.activeUser.preferredName,
            male: e.activeUser.male,
            signupId: activeSignupId,
            unavailableEventIds: [],
            ...(isSubbed
                ? {
                      subForOriginalUserId: e.originalUser.id,
                      subForOriginalName: formatPlayerSummaryName(
                          e.originalUser
                      ),
                      originalRound: e.round,
                      originalOverall: e.overall
                  }
                : {})
        }
        let out: RosterPlayer | undefined
        if (isSubbed) {
            const outSignupId = signupIdByUser.get(e.originalUser.id) ?? -1
            const last = e.chain[e.chain.length - 1]
            out = {
                userId: e.originalUser.id,
                firstName: e.originalUser.firstName,
                lastName: e.originalUser.lastName,
                preferredName: e.originalUser.preferredName,
                male: e.originalUser.male,
                signupId: outSignupId,
                unavailableEventIds: [],
                isSubbedOut: true,
                subbedOutAt: last.effectiveAt.toISOString(),
                originalRound: e.round,
                originalOverall: e.overall
            }
        }
        return { active, out }
    })

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

    // Get unavailability for all roster signups (active players + subbed-out
    // originals so historical unavailability is still visible if needed).
    const signupIds = built
        .flatMap((b) => [b.active.signupId, b.out?.signupId ?? -1])
        .filter((id) => id > 0)
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

    const unavailBySignup = new Map<number, Set<number>>()
    for (const row of unavailabilityRows) {
        if (row.signupId == null) continue
        if (!unavailBySignup.has(row.signupId)) {
            unavailBySignup.set(row.signupId, new Set())
        }
        unavailBySignup.get(row.signupId)!.add(row.eventId)
    }

    const roster: RosterPlayer[] = []
    for (const b of built) {
        roster.push({
            ...b.active,
            unavailableEventIds: Array.from(
                unavailBySignup.get(b.active.signupId) ?? []
            )
        })
        if (b.out) {
            roster.push({
                ...b.out,
                unavailableEventIds: Array.from(
                    unavailBySignup.get(b.out.signupId) ?? []
                )
            })
        }
    }

    const allSeasonRows = await db
        .select({ id: seasons.id, year: seasons.year, season: seasons.season })
        .from(seasons)
        .orderBy(desc(seasons.id))

    const allSeasons: SeasonInfo[] = allSeasonRows.map((s) => ({
        id: s.id,
        year: s.year,
        name: s.season
    }))

    // Fetch team's match times + ids so the panel can pass matchId to
    // lockInRegularSub and the matrix can annotate per-match info.
    const teamMatchRows = await db
        .select({ id: matches.id, date: matches.date, time: matches.time })
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
    const dateMatchInfo: Record<string, DateMatchInfo> = {}
    for (const m of teamMatchRows) {
        if (!m.date) continue
        teamMatchTimeByEventDate[m.date] = m.time ?? null
        dateMatchInfo[m.date] = {
            matchId: m.id,
            matchTime: m.time ?? null,
            regularSubs: []
        }
    }

    // Attach any regular subs already recorded for this team's matches.
    const subsByMatch = await getMatchSubsForTeamSeason(
        config.seasonId,
        selectedTeam.id
    )
    for (const m of teamMatchRows) {
        if (!m.date) continue
        const subs: MatchSubEntry[] = subsByMatch.get(m.id) ?? []
        dateMatchInfo[m.date].regularSubs = subs.map((s) => ({
            originalName: formatPlayerSummaryName(s.originalUser),
            subName: formatPlayerSummaryName(s.subUser)
        }))
    }

    // Authorization flags for the FindSubPanel.
    const canLockInPermanent =
        isAdmin ||
        commissionerScope.type === "league_wide" ||
        (commissionerScope.type === "division_specific" &&
            commissionerScope.divisionIds.includes(
                allTeamRows.find((t) => t.id === selectedTeam.id)?.division ??
                    -1
            ))
    const canSeeFullWaitlist = canLockInPermanent

    return {
        status: true,
        isAdmin,
        team: selectedTeam,
        allTeams: availableTeams,
        events: events as EventInfo[],
        roster,
        allSeasons,
        playerPicUrl: process.env.PLAYER_PIC_URL ?? "",
        teamMatchTimeByEventDate,
        dateMatchInfo,
        canLockInPermanent,
        canSeeFullWaitlist
    }
}
