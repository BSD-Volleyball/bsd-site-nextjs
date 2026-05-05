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
    matches,
    waitlist,
    seasons,
    substitutions,
    matchSubstitutions
} from "@/database/schema"
import { eq, and, inArray, or, asc, desc } from "drizzle-orm"
import { headers } from "next/headers"
import { getSeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"
import { isAdminOrDirector, getCommissionerDivisionScope } from "@/lib/rbac"
import {
    getTeamRosterWithSubs,
    resolveActiveUserForSlot,
    formatPlayerSummaryName
} from "@/lib/roster"
import { ok, fail, type ActionResult } from "@/lib/action-helpers"

async function canAccessTeam(
    userId: string,
    teamId: number,
    seasonId: number
): Promise<boolean> {
    if (await isAdminOrDirector(userId)) return true

    const [teamRow] = await db
        .select({
            captain: teams.captain,
            captain2: teams.captain2,
            division: teams.division
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1)

    if (!teamRow) return false
    if (teamRow.captain === userId || teamRow.captain2 === userId) return true

    const scope = await getCommissionerDivisionScope(userId, seasonId)
    if (scope.type === "league_wide") return true
    if (scope.type === "division_specific") {
        return scope.divisionIds.includes(teamRow.division)
    }
    return false
}

export type RegularSubCandidate = {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    teamId: number
    teamName: string
    teamNumber: number | null
    divisionName: string
    round: number
    overall: number
    matchTime: string | null
    score: number
    notes: string[]
}

export type PermanentSubCandidate = {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    lastDivisionName: string | null
    lastSeasonLabel: string | null
    lastRound: number | null
    lastOverall: number | null
    score: number
}

function parseTimeMins(timeStr: string | null): number | null {
    if (!timeStr) return null
    const parts = timeStr.split(":")
    if (parts.length < 2) return null
    const h = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    if (Number.isNaN(h) || Number.isNaN(m)) return null
    return h * 60 + m
}

export async function getRegularSubCandidates(
    teamId: number,
    eventId: number,
    missingUserIds: string[]
): Promise<
    | {
          status: true
          candidates: RegularSubCandidate[]
          nonMaleNeeded: boolean
          missingCount: number
          missingPlayers: { name: string; round: number }[]
      }
    | { status: false; message: string }
> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { status: false, message: "Not authenticated." }

    const config = await getSeasonConfig()
    if (!config.seasonId) return { status: false, message: "No active season." }

    if (!(await canAccessTeam(session.user.id, teamId, config.seasonId))) {
        return { status: false, message: "Not authorized." }
    }

    // Get team's division info
    const [teamRow] = await db
        .select({
            id: teams.id,
            division: teams.division,
            divisionLevel: divisions.level,
            divisionName: divisions.name
        })
        .from(teams)
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .where(eq(teams.id, teamId))
        .limit(1)

    if (!teamRow) return { status: false, message: "Team not found." }

    // Get event date
    const [eventRow] = await db
        .select({ eventDate: seasonEvents.event_date })
        .from(seasonEvents)
        .where(eq(seasonEvents.id, eventId))
        .limit(1)

    if (!eventRow) return { status: false, message: "Event not found." }

    const eventDate = eventRow.eventDate

    // Find captain's team match on this date (to get time and opponent)
    const [teamMatch] = await db
        .select({
            id: matches.id,
            time: matches.time,
            homeTeam: matches.home_team,
            awayTeam: matches.away_team
        })
        .from(matches)
        .where(
            and(
                eq(matches.season, config.seasonId),
                eq(matches.date, eventDate),
                or(eq(matches.home_team, teamId), eq(matches.away_team, teamId))
            )
        )
        .limit(1)

    const ourMatchTimeMins = parseTimeMins(teamMatch?.time ?? null)
    const opponentTeamId = teamMatch
        ? teamMatch.homeTeam === teamId
            ? teamMatch.awayTeam
            : teamMatch.homeTeam
        : null

    // Fetch draft data (round/overall) for the manually selected missing players
    let missingRosterRows: {
        userId: string
        round: number
        overall: number
    }[] = []
    if (missingUserIds.length > 0) {
        missingRosterRows = await db
            .select({
                userId: drafts.user,
                round: drafts.round,
                overall: drafts.overall
            })
            .from(drafts)
            .where(
                and(
                    eq(drafts.team, teamId),
                    inArray(drafts.user, missingUserIds)
                )
            )
    }

    // Determine non-male missing count and best missing player's overall pick
    let nonMalesMissing = 0
    let bestMissingOverall: number | null = null
    const missingPlayers: { name: string; round: number }[] = []

    if (missingUserIds.length > 0) {
        const missingUserRows = await db
            .select({
                id: users.id,
                male: users.male,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(users)
            .where(inArray(users.id, missingUserIds))

        const missingUserMap = new Map(missingUserRows.map((u) => [u.id, u]))

        for (const u of missingUserRows) {
            if (u.male !== true) nonMalesMissing++
        }

        for (const r of missingRosterRows) {
            if (bestMissingOverall === null || r.overall < bestMissingOverall) {
                bestMissingOverall = r.overall
            }
            const u = missingUserMap.get(r.userId)
            if (u) {
                const name = u.preferredName
                    ? `${u.preferredName} ${u.lastName}`
                    : `${u.firstName} ${u.lastName}`
                missingPlayers.push({ name, round: r.round })
            }
        }
        missingPlayers.sort((a, b) => a.round - b.round)
    }

    const nonMaleNeeded = nonMalesMissing >= 2

    // Build list of divisions to search: same + adjacent below
    const allDivisions = await db
        .select({ id: divisions.id, level: divisions.level })
        .from(divisions)
        .where(eq(divisions.active, true))
        .orderBy(asc(divisions.level))

    const ourDivIdx = allDivisions.findIndex((d) => d.id === teamRow.division)
    const divisionIdsToSearch: number[] = [teamRow.division]
    if (ourDivIdx >= 0 && ourDivIdx < allDivisions.length - 1) {
        divisionIdsToSearch.push(allDivisions[ourDivIdx + 1].id)
    }

    // Excluded team IDs: our team + opponent
    const excludedTeamIds = new Set<number>([teamId])
    if (opponentTeamId) excludedTeamIds.add(opponentTeamId)

    // Find all matches in relevant divisions on this date
    const matchesOnDate = await db
        .select({
            time: matches.time,
            homeTeam: matches.home_team,
            awayTeam: matches.away_team,
            divisionId: matches.division
        })
        .from(matches)
        .where(
            and(
                eq(matches.season, config.seasonId),
                eq(matches.date, eventDate),
                inArray(matches.division, divisionIdsToSearch)
            )
        )

    // Map each non-excluded team to its match time
    const teamMatchTimeMap = new Map<number, string | null>()
    for (const m of matchesOnDate) {
        for (const tId of [m.homeTeam, m.awayTeam]) {
            if (!tId || excludedTeamIds.has(tId)) continue
            // Disqualify players whose match is at the same time as ours
            const candidateTimeMins = parseTimeMins(m.time)
            if (
                ourMatchTimeMins !== null &&
                candidateTimeMins !== null &&
                candidateTimeMins === ourMatchTimeMins
            ) {
                continue
            }
            teamMatchTimeMap.set(tId, m.time ?? null)
        }
    }

    const candidateTeamIds = Array.from(teamMatchTimeMap.keys())
    if (candidateTeamIds.length === 0) {
        return {
            status: true,
            candidates: [],
            nonMaleNeeded,
            missingCount: missingUserIds.length,
            missingPlayers
        }
    }

    // Get roster players on candidate teams
    const candidateDraftRows = await db
        .select({
            userId: drafts.user,
            teamId: drafts.team,
            round: drafts.round,
            overall: drafts.overall,
            signupId: signups.id
        })
        .from(drafts)
        .innerJoin(
            signups,
            and(
                eq(signups.player, drafts.user),
                eq(signups.season, config.seasonId)
            )
        )
        .where(inArray(drafts.team, candidateTeamIds))

    if (candidateDraftRows.length === 0) {
        return {
            status: true,
            candidates: [],
            nonMaleNeeded,
            missingCount: missingUserIds.length,
            missingPlayers
        }
    }

    // Filter out candidates who are unavailable for this event
    const candidateSignupIds = candidateDraftRows.map((r) => r.signupId)
    const unavailCandidateRows = await db
        .select({ signupId: userUnavailability.signup_id })
        .from(userUnavailability)
        .where(
            and(
                inArray(userUnavailability.signup_id, candidateSignupIds),
                eq(userUnavailability.event_id, eventId)
            )
        )
    const unavailCandidateSignupIds = new Set(
        unavailCandidateRows.map((r) => r.signupId!)
    )

    const availableDraftRows = candidateDraftRows.filter(
        (r) => !unavailCandidateSignupIds.has(r.signupId)
    )

    if (availableDraftRows.length === 0) {
        return {
            status: true,
            candidates: [],
            nonMaleNeeded,
            missingCount: missingUserIds.length,
            missingPlayers
        }
    }

    // Fetch user info for available candidates
    const candidateUserIds = [
        ...new Set(availableDraftRows.map((r) => r.userId))
    ]
    const candidateUserRows = await db
        .select({
            id: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            male: users.male
        })
        .from(users)
        .where(inArray(users.id, candidateUserIds))

    const userMap = new Map(candidateUserRows.map((u) => [u.id, u]))

    // Fetch team info for candidate teams
    const candidateTeamRows = await db
        .select({
            id: teams.id,
            name: teams.name,
            number: teams.number,
            divisionId: teams.division,
            divisionName: divisions.name
        })
        .from(teams)
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .where(inArray(teams.id, candidateTeamIds))

    const teamMap = new Map(candidateTeamRows.map((t) => [t.id, t]))

    // Score each candidate (deduplicated by userId)
    const seenUserIds = new Set<string>()
    const scored: RegularSubCandidate[] = []

    for (const candidate of availableDraftRows) {
        if (seenUserIds.has(candidate.userId)) continue
        seenUserIds.add(candidate.userId)

        const user = userMap.get(candidate.userId)
        const team = teamMap.get(candidate.teamId)
        if (!user || !team) continue

        const matchTime = teamMatchTimeMap.get(candidate.teamId) ?? null
        const candidateTimeMins = parseTimeMins(matchTime)
        const notes: string[] = []
        let score = 0

        // Gender scoring
        if (nonMaleNeeded) {
            if (user.male !== true) {
                score += 200
                notes.push("Non-male ✓")
            } else {
                score -= 100
            }
        }

        // Overall pick proximity scoring (works across divisions — same or higher overall = same/weaker quality = preferred)
        if (bestMissingOverall !== null) {
            const overallDiff = candidate.overall - bestMissingOverall
            if (overallDiff === 0) {
                score += 100
            } else if (overallDiff > 0) {
                // Candidate drafted later = weaker or same skill, doesn't strengthen team
                score += Math.max(0, 100 - overallDiff * 8)
            } else {
                // Candidate drafted earlier = stronger pick, less ideal
                score += Math.max(-80, overallDiff * 10)
                notes.push("Stronger pick")
            }
        }

        // Time slot scoring — adjacent preferred
        if (ourMatchTimeMins !== null && candidateTimeMins !== null) {
            const timeDiff = Math.abs(candidateTimeMins - ourMatchTimeMins)
            if (timeDiff <= 90) {
                score += 50
                notes.push("Adjacent time slot")
            }
        }

        // Same division bonus
        if (team.divisionId === teamRow.division) {
            score += 30
        } else {
            notes.push("From adjacent division")
        }

        scored.push({
            userId: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            preferredName: user.preferredName,
            male: user.male,
            teamId: candidate.teamId,
            teamName: team.name,
            teamNumber: team.number,
            divisionName: team.divisionName,
            round: candidate.round,
            overall: candidate.overall,
            matchTime,
            score,
            notes
        })
    }

    scored.sort((a, b) => b.score - a.score)

    return {
        status: true,
        candidates: scored.slice(0, 5),
        nonMaleNeeded,
        missingCount: missingUserIds.length,
        missingPlayers
    }
}

export async function getPermanentSubCandidates(
    teamId: number,
    playerUserId: string
): Promise<
    | {
          status: true
          candidates: PermanentSubCandidate[]
          replacedPlayerName: string
      }
    | { status: false; message: string }
> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { status: false, message: "Not authenticated." }

    const config = await getSeasonConfig()
    if (!config.seasonId) return { status: false, message: "No active season." }

    if (!(await canAccessTeam(session.user.id, teamId, config.seasonId))) {
        return { status: false, message: "Not authorized." }
    }

    // Get the player being replaced — their gender, draft position, and division
    const [playerRow] = await db
        .select({
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            male: users.male,
            round: drafts.round,
            overall: drafts.overall,
            divisionId: teams.division,
            divisionName: divisions.name
        })
        .from(drafts)
        .innerJoin(users, eq(drafts.user, users.id))
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .where(and(eq(drafts.user, playerUserId), eq(drafts.team, teamId)))
        .limit(1)

    if (!playerRow)
        return { status: false, message: "Player not found on team." }

    const replacedPlayerName = playerRow.preferredName
        ? `${playerRow.preferredName} ${playerRow.lastName}`
        : `${playerRow.firstName} ${playerRow.lastName}`

    // Get all waitlist entries for this season
    const waitlistRows = await db
        .select({
            waitlistId: waitlist.id,
            userId: waitlist.user,
            approved: waitlist.approved,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            male: users.male
        })
        .from(waitlist)
        .innerJoin(users, eq(waitlist.user, users.id))
        .where(eq(waitlist.season, config.seasonId))

    // Filter to same gender
    const sameGenderRows = waitlistRows.filter((r) => r.male === playerRow.male)

    if (sameGenderRows.length === 0) {
        return { status: true, candidates: [], replacedPlayerName }
    }

    // Fetch all divisions with their levels for proximity scoring
    const allDivisionRows = await db
        .select({ id: divisions.id, level: divisions.level })
        .from(divisions)
        .where(eq(divisions.active, true))

    const divisionLevelMap = new Map(
        allDivisionRows.map((d) => [d.id, d.level])
    )
    const playerDivLevel = divisionLevelMap.get(playerRow.divisionId) ?? null

    // Get historical draft data for waitlist players to find their most recent division
    const waitlistUserIds = sameGenderRows.map((r) => r.userId)
    const draftHistoryRows = await db
        .select({
            userId: drafts.user,
            round: drafts.round,
            overall: drafts.overall,
            divisionId: teams.division,
            divisionName: divisions.name,
            seasonId: seasons.id,
            seasonYear: seasons.year,
            seasonName: seasons.season
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .where(inArray(drafts.user, waitlistUserIds))
        .orderBy(desc(seasons.id))

    // Keep most-recent season's data per user
    type DraftHistory = {
        lastDivisionId: number
        lastDivisionName: string
        lastSeasonLabel: string
        lastRound: number
        lastOverall: number
    }
    const historyMap = new Map<string, DraftHistory>()
    for (const row of draftHistoryRows) {
        if (!historyMap.has(row.userId)) {
            const label = `${row.seasonName.charAt(0).toUpperCase()}${row.seasonName.slice(1)} ${row.seasonYear}`
            historyMap.set(row.userId, {
                lastDivisionId: row.divisionId,
                lastDivisionName: row.divisionName,
                lastSeasonLabel: label,
                lastRound: row.round,
                lastOverall: row.overall
            })
        }
    }

    // Score and rank
    const scored: PermanentSubCandidate[] = sameGenderRows.map((r) => {
        const history = historyMap.get(r.userId)
        let score = 0

        // Division proximity is the primary factor (same division = highest score)
        if (history) {
            const histLevel =
                divisionLevelMap.get(history.lastDivisionId) ?? null
            if (playerDivLevel !== null && histLevel !== null) {
                const levelDiff = Math.abs(histLevel - playerDivLevel)
                if (levelDiff === 0) {
                    score += 300
                } else if (levelDiff === 1) {
                    score += 100
                } else if (levelDiff === 2) {
                    score += 50
                } else {
                    score += 20
                }
            } else {
                score += 20 // has history but level unknown
            }
        }

        // Overall pick proximity
        if (history?.lastOverall != null) {
            const diff = Math.abs(history.lastOverall - playerRow.overall)
            score += Math.max(0, 100 - diff * 5)
        }

        return {
            userId: r.userId,
            firstName: r.firstName,
            lastName: r.lastName,
            preferredName: r.preferredName,
            male: r.male,
            lastDivisionName: history?.lastDivisionName ?? null,
            lastSeasonLabel: history?.lastSeasonLabel ?? null,
            lastRound: history?.lastRound ?? null,
            lastOverall: history?.lastOverall ?? null,
            score
        }
    })

    scored.sort((a, b) => b.score - a.score)

    return {
        status: true,
        candidates: scored.slice(0, 5),
        replacedPlayerName
    }
}

export type SubContactDetails = {
    email: string
    phone: string | null
}

export async function getSubContactDetails(
    targetUserId: string,
    teamId: number
): Promise<
    | { status: true; contact: SubContactDetails }
    | { status: false; error: string }
> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { status: false, error: "Not authenticated" }

    const config = await getSeasonConfig()
    if (!config.seasonId) return { status: false, error: "No active season." }

    if (!(await canAccessTeam(session.user.id, teamId, config.seasonId))) {
        return { status: false, error: "Not authorized." }
    }

    const [row] = await db
        .select({ email: users.email, phone: users.phone })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1)

    if (!row) return { status: false, error: "User not found" }

    return { status: true, contact: { email: row.email, phone: row.phone } }
}

// True if the user is an admin/director or commissioner of the team's division.
// Captains explicitly excluded — used to gate permanent-sub lock-ins and the
// full waitlist dropdown.
async function canManageTeamAsElevated(
    userId: string,
    teamId: number,
    seasonId: number
): Promise<boolean> {
    if (await isAdminOrDirector(userId)) return true
    const [teamRow] = await db
        .select({ division: teams.division })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1)
    if (!teamRow) return false
    const scope = await getCommissionerDivisionScope(userId, seasonId)
    if (scope.type === "league_wide") return true
    if (scope.type === "division_specific") {
        return scope.divisionIds.includes(teamRow.division)
    }
    return false
}

async function findUserName(userId: string): Promise<string> {
    const [u] = await db
        .select({
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    if (!u) return userId
    return u.preferredName
        ? `${u.preferredName} ${u.lastName}`
        : `${u.firstName} ${u.lastName}`
}

export type WaitlistOption = {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    lastDivisionName: string | null
    lastSeasonLabel: string | null
}

/**
 * Full waitlist for the season (no gender filter), excluding anyone who is
 * already on a team this season as a draftee or active permanent sub.
 *
 * Authorization: admin or commissioner only — captains do not see this list.
 */
export async function getWaitlistOptions(
    teamId: number
): Promise<ActionResult<WaitlistOption[]>> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return fail("Not authenticated.")

    const config = await getSeasonConfig()
    if (!config.seasonId) return fail("No active season.")

    if (
        !(await canManageTeamAsElevated(
            session.user.id,
            teamId,
            config.seasonId
        ))
    ) {
        return fail("Not authorized.")
    }

    const waitlistRows = await db
        .select({
            userId: waitlist.user,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            male: users.male
        })
        .from(waitlist)
        .innerJoin(users, eq(waitlist.user, users.id))
        .where(eq(waitlist.season, config.seasonId))
        .orderBy(asc(users.last_name), asc(users.first_name))

    if (waitlistRows.length === 0) return ok([])

    // Exclude users currently on any team this season (draftee or active sub).
    const seasonRoster = await getTeamRosterWithSubs(config.seasonId)
    const onTeamUserIds = new Set<string>()
    for (const slot of seasonRoster) {
        onTeamUserIds.add(slot.activeUser.id)
    }

    // Pull each waitlist user's most-recent draft division for context display.
    const waitlistUserIds = waitlistRows.map((r) => r.userId)
    const historyRows = await db
        .select({
            userId: drafts.user,
            divisionName: divisions.name,
            seasonId: seasons.id,
            seasonYear: seasons.year,
            seasonName: seasons.season
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .where(inArray(drafts.user, waitlistUserIds))
        .orderBy(desc(seasons.id))

    const historyByUser = new Map<
        string,
        { divisionName: string; seasonLabel: string }
    >()
    for (const h of historyRows) {
        if (!historyByUser.has(h.userId)) {
            const label = `${h.seasonName.charAt(0).toUpperCase()}${h.seasonName.slice(1)} ${h.seasonYear}`
            historyByUser.set(h.userId, {
                divisionName: h.divisionName,
                seasonLabel: label
            })
        }
    }

    const options: WaitlistOption[] = waitlistRows
        .filter((r) => !onTeamUserIds.has(r.userId))
        .map((r) => {
            const h = historyByUser.get(r.userId)
            return {
                userId: r.userId,
                firstName: r.firstName,
                lastName: r.lastName,
                preferredName: r.preferredName,
                male: r.male,
                lastDivisionName: h?.divisionName ?? null,
                lastSeasonLabel: h?.seasonLabel ?? null
            }
        })

    return ok(options)
}

/**
 * Locks in a permanent sub. Admin or division commissioner only.
 *
 * The original draft row is never mutated. A new substitutions row is inserted
 * referencing the original_draft so chain history is preserved. The sub-in
 * user's waitlist row for this season is removed inside the same transaction.
 */
export async function lockInPermanentSub(input: {
    teamId: number
    originalUserId: string
    subUserId: string
    reason?: string
    notes?: string
}): Promise<ActionResult<{ substitutionId: number }>> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return fail("Not authenticated.")

    const config = await getSeasonConfig()
    if (!config.seasonId) return fail("No active season.")

    const { teamId, originalUserId, subUserId, reason, notes } = input
    if (!Number.isInteger(teamId) || teamId <= 0) return fail("Invalid team.")
    if (typeof originalUserId !== "string" || !originalUserId)
        return fail("Invalid original user.")
    if (typeof subUserId !== "string" || !subUserId)
        return fail("Invalid sub user.")
    if (originalUserId === subUserId)
        return fail("Original and sub user must differ.")

    if (
        !(await canManageTeamAsElevated(
            session.user.id,
            teamId,
            config.seasonId
        ))
    ) {
        return fail("Not authorized to lock in a permanent sub.")
    }

    const [teamRow] = await db
        .select({
            id: teams.id,
            name: teams.name,
            number: teams.number,
            season: teams.season,
            division: teams.division
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1)
    if (!teamRow) return fail("Team not found.")
    if (teamRow.season !== config.seasonId)
        return fail("Team is not in the active season.")

    // Resolve roster slot — the UI may pass either the original draftee or the
    // currently-active player. Find the slot whose active player is originalUserId.
    const roster = await getTeamRosterWithSubs(config.seasonId, teamId)
    const slot = roster.find((s) => s.activeUser.id === originalUserId)
    if (!slot)
        return fail(
            "Player is not currently active on this team's roster (they may already have been subbed)."
        )

    // Sub-in user must be on the season's waitlist.
    const [waitlistRow] = await db
        .select({ id: waitlist.id })
        .from(waitlist)
        .where(
            and(
                eq(waitlist.season, config.seasonId),
                eq(waitlist.user, subUserId)
            )
        )
        .limit(1)
    if (!waitlistRow)
        return fail("Sub user is not on the waitlist for this season.")

    // Sub-in user must not be on any team this season already.
    const onTeam = roster.some((s) => s.activeUser.id === subUserId)
    if (onTeam) return fail("Sub user is already on a team this season.")
    const [otherDraft] = await db
        .select({ id: drafts.id })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .where(
            and(eq(drafts.user, subUserId), eq(teams.season, config.seasonId))
        )
        .limit(1)
    if (otherDraft)
        return fail("Sub user is already drafted on a team this season.")

    const originalName = formatPlayerSummaryName(slot.activeUser)
    const subName = await findUserName(subUserId)

    let insertedId: number
    try {
        insertedId = await db.transaction(async (tx) => {
            const inserted = await tx
                .insert(substitutions)
                .values({
                    team: teamId,
                    season: config.seasonId,
                    original_draft: slot.draftId,
                    original_user: slot.activeUser.id,
                    sub_user: subUserId,
                    performed_by: session.user.id,
                    reason: reason?.trim() || null,
                    notes: notes?.trim() || null
                })
                .returning({ id: substitutions.id })
            await tx.delete(waitlist).where(eq(waitlist.id, waitlistRow.id))
            return inserted[0].id
        })
    } catch (err) {
        console.error("Failed to lock in permanent sub:", err)
        return fail("Failed to record substitution.")
    }

    await logAuditEntry({
        userId: session.user.id,
        action: "create",
        entityType: "substitutions",
        entityId: insertedId,
        summary: `Locked in permanent sub: ${subName} replaces ${originalName} on ${teamRow.name}${teamRow.number != null ? ` (#${teamRow.number})` : ""} for season ${config.seasonId} (performed by ${session.user.name ?? session.user.id})`
    })

    return ok({ substitutionId: insertedId })
}

/**
 * Locks in a regular (single-match) sub. Captain of the team, admin, or
 * division commissioner. Does NOT consume the sub-in user's waitlist row.
 */
export async function lockInRegularSub(input: {
    teamId: number
    matchId: number
    originalUserId: string
    subUserId: string
    notes?: string
}): Promise<ActionResult<{ matchSubstitutionId: number }>> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return fail("Not authenticated.")

    const config = await getSeasonConfig()
    if (!config.seasonId) return fail("No active season.")

    const { teamId, matchId, originalUserId, subUserId, notes } = input
    if (!Number.isInteger(teamId) || teamId <= 0) return fail("Invalid team.")
    if (!Number.isInteger(matchId) || matchId <= 0)
        return fail("Invalid match.")
    if (typeof originalUserId !== "string" || !originalUserId)
        return fail("Invalid original user.")
    if (typeof subUserId !== "string" || !subUserId)
        return fail("Invalid sub user.")
    if (originalUserId === subUserId)
        return fail("Original and sub user must differ.")

    if (!(await canAccessTeam(session.user.id, teamId, config.seasonId))) {
        return fail("Not authorized.")
    }

    const [matchRow] = await db
        .select({
            id: matches.id,
            season: matches.season,
            homeTeam: matches.home_team,
            awayTeam: matches.away_team,
            date: matches.date
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1)
    if (!matchRow) return fail("Match not found.")
    if (matchRow.season !== config.seasonId)
        return fail("Match is not in the active season.")
    if (matchRow.homeTeam !== teamId && matchRow.awayTeam !== teamId)
        return fail("Match does not belong to this team.")

    // Confirm originalUserId is currently active on the team (resolves the
    // permanent-sub chain). Reject if they've been permanently subbed out.
    const slot = await resolveActiveUserForSlot(teamId, originalUserId)
    let activeOriginal: string
    if (slot && slot.activeUserId === originalUserId) {
        activeOriginal = originalUserId
    } else {
        // Allow callers to pass the original draftee even if no chain exists.
        // Otherwise reject — the player isn't on this team's active roster.
        const [draftRow] = await db
            .select({ id: drafts.id })
            .from(drafts)
            .where(
                and(eq(drafts.team, teamId), eq(drafts.user, originalUserId))
            )
            .limit(1)
        if (!draftRow)
            return fail(
                "Player is not on this team's active roster for this match."
            )
        activeOriginal = originalUserId
    }

    // Sub-in user must be on the waitlist for this season.
    const [waitlistRow] = await db
        .select({ id: waitlist.id })
        .from(waitlist)
        .where(
            and(
                eq(waitlist.season, config.seasonId),
                eq(waitlist.user, subUserId)
            )
        )
        .limit(1)
    if (!waitlistRow)
        return fail("Sub user is not on the waitlist for this season.")

    // Reject duplicate (match, original_user) — also enforced by unique index.
    const [existing] = await db
        .select({ id: matchSubstitutions.id })
        .from(matchSubstitutions)
        .where(
            and(
                eq(matchSubstitutions.match, matchId),
                eq(matchSubstitutions.original_user, activeOriginal)
            )
        )
        .limit(1)
    if (existing)
        return fail("A sub is already recorded for this player on this match.")

    const originalName = await findUserName(activeOriginal)
    const subName = await findUserName(subUserId)

    let insertedId: number
    try {
        const inserted = await db
            .insert(matchSubstitutions)
            .values({
                match: matchId,
                team: teamId,
                season: config.seasonId,
                original_user: activeOriginal,
                sub_user: subUserId,
                performed_by: session.user.id,
                notes: notes?.trim() || null
            })
            .returning({ id: matchSubstitutions.id })
        insertedId = inserted[0].id
    } catch (err) {
        console.error("Failed to lock in regular sub:", err)
        return fail("Failed to record substitution.")
    }

    await logAuditEntry({
        userId: session.user.id,
        action: "create",
        entityType: "match_substitutions",
        entityId: insertedId,
        summary: `Locked in regular sub: ${subName} subs for ${originalName} on team ${teamId} for match ${matchId}${matchRow.date ? ` (${matchRow.date})` : ""} (performed by ${session.user.name ?? session.user.id})`
    })

    return ok({ matchSubstitutionId: insertedId })
}

export async function logSubContactViewed(
    captainTeamId: number,
    targetUserId: string,
    targetName: string
): Promise<void> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return

    const config = await getSeasonConfig()
    if (!config.seasonId) return

    if (!(await canAccessTeam(session.user.id, captainTeamId, config.seasonId)))
        return

    await logAuditEntry({
        userId: session.user.id,
        action: "view",
        entityType: "users",
        entityId: targetUserId,
        summary: `Captain (${session.user.name ?? session.user.id}) viewed sub contact details for "${targetName}" while finding a sub for team ${captainTeamId}`
    })
}
