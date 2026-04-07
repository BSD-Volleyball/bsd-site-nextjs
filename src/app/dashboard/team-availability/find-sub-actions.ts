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
    seasons
} from "@/database/schema"
import { eq, and, inArray, or, asc, desc } from "drizzle-orm"
import { headers } from "next/headers"
import { getSeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"

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
    eventId: number
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

    // Get our roster with signup IDs
    const ourRosterRows = await db
        .select({
            userId: drafts.user,
            signupId: signups.id,
            round: drafts.round,
            overall: drafts.overall
        })
        .from(drafts)
        .innerJoin(
            signups,
            and(
                eq(signups.player, drafts.user),
                eq(signups.season, config.seasonId)
            )
        )
        .where(eq(drafts.team, teamId))

    // Find who on our team is unavailable for this event
    const ourSignupIds = ourRosterRows.map((r) => r.signupId)
    let unavailOurSignupIds = new Set<number>()
    if (ourSignupIds.length > 0) {
        const rows = await db
            .select({ signupId: userUnavailability.signup_id })
            .from(userUnavailability)
            .where(
                and(
                    inArray(userUnavailability.signup_id, ourSignupIds),
                    eq(userUnavailability.event_id, eventId)
                )
            )
        unavailOurSignupIds = new Set(rows.map((r) => r.signupId!))
    }

    const missingRosterRows = ourRosterRows.filter((r) =>
        unavailOurSignupIds.has(r.signupId)
    )
    const missingUserIds = missingRosterRows.map((r) => r.userId)

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
    targetUserId: string
): Promise<
    | { status: true; contact: SubContactDetails }
    | { status: false; error: string }
> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { status: false, error: "Not authenticated" }

    const [row] = await db
        .select({ email: users.email, phone: users.phone })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1)

    if (!row) return { status: false, error: "User not found" }

    return { status: true, contact: { email: row.email, phone: row.phone } }
}

export async function logSubContactViewed(
    captainTeamId: number,
    targetUserId: string,
    targetName: string
): Promise<void> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return

    await logAuditEntry({
        userId: session.user.id,
        action: "view",
        entityType: "users",
        entityId: targetUserId,
        summary: `Captain (${session.user.name ?? session.user.id}) viewed sub contact details for "${targetName}" while finding a sub for team ${captainTeamId}`
    })
}
