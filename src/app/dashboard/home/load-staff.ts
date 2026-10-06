import "server-only"

import { and, asc, count, eq, gte } from "drizzle-orm"
import { db } from "@/database/db"
import {
    concerns,
    divisions,
    matches,
    matchReferees,
    teams
} from "@/database/schema"
import { getUserRolesForUser } from "@/lib/rbac"
import type { SeasonPhase } from "@/lib/season-phases"
import {
    assignmentCourtLabel,
    assignmentNightLabel,
    assignmentTimeLabel,
    getVolunteerAssignmentsForSeason
} from "@/lib/tryout-volunteer-schedule"
import { hasPermissionBySession } from "@/next/session"
import { getNewPlayerEvalStats } from "../queries"

// Loaders for the volunteer/staff cards on the dashboard home: concerns,
// new-player evaluations, tryout volunteer jobs and referee scheduling.
// Each takes the caller's own user id, resolved from the session by the page.

export interface TryoutVolunteerJob {
    assignmentId: number
    jobName: string
    notes: string | null
    nightLabel: string
    timeLabel: string
    courtLabel: string | null
}

export interface RefUpcomingMatch {
    date: string
    time: string
    court: number | null
    divisionName: string
    homeTeamName: string
    awayTeamName: string
}

export interface RefScheduleStatus {
    nextDateLabel: string
    totalMatches: number
    assignedMatches: number
    fullyScheduled: boolean
}

export async function loadStaffStats(
    userId: string,
    seasonId: number,
    isAdmin: boolean
) {
    let assignedActiveConcernsCount = 0

    // Run permission check and admin eval stats in parallel — both are independent
    const [canViewConcerns, evalStats] = await Promise.all([
        seasonId
            ? hasPermissionBySession("concerns:view", { seasonId })
            : Promise.resolve(false),
        isAdmin && seasonId
            ? getNewPlayerEvalStats(userId, seasonId)
            : Promise.resolve(null)
    ])

    if (canViewConcerns) {
        const [assignedConcernCount] = await db
            .select({ total: count() })
            .from(concerns)
            .where(
                and(
                    eq(concerns.assigned_to, userId),
                    eq(concerns.status, "active")
                )
            )

        assignedActiveConcernsCount = assignedConcernCount?.total ?? 0
    }

    return { evalStats, assignedActiveConcernsCount }
}

// Tryout volunteer jobs this player has been assigned
export async function loadTryoutVolunteerJobs(
    userId: string,
    seasonId: number
): Promise<TryoutVolunteerJob[]> {
    const assignments = await getVolunteerAssignmentsForSeason(seasonId)
    return assignments
        .filter((a) => a.userId === userId)
        .map((a) => ({
            assignmentId: a.assignmentId,
            jobName: a.jobName,
            notes: a.jobNotes,
            nightLabel: assignmentNightLabel(a),
            timeLabel: assignmentTimeLabel(a),
            courtLabel: assignmentCourtLabel(a)
        }))
}

// Ref dashboard card data
export async function loadRefereeCards(
    userId: string,
    seasonId: number,
    phase: SeasonPhase
) {
    let refUpcomingMatches: RefUpcomingMatch[] = []
    let isRefForSeason = false
    let isRefCoordinator = false
    let refScheduleStatus: RefScheduleStatus | null = null

    if (!["regular_season", "playoffs", "complete"].includes(phase)) {
        return {
            refUpcomingMatches,
            isRefForSeason,
            isRefCoordinator,
            refScheduleStatus
        }
    }

    const todayStr = new Date().toISOString().slice(0, 10)

    const [refCheck, userRoles] = await Promise.all([
        hasPermissionBySession("schedule:view", { seasonId }),
        getUserRolesForUser(userId)
    ])
    isRefForSeason = refCheck
    isRefCoordinator = userRoles.some(
        (r) =>
            r.role === "referee_coordinator" &&
            (r.season_id === null || r.season_id === seasonId)
    )

    if (isRefForSeason) {
        // Get upcoming matches for this ref on the next game night
        const homeTeam = db
            .select({
                id: teams.id,
                name: teams.name
            })
            .from(teams)
            .as("home_team_t")
        const awayTeam = db
            .select({
                id: teams.id,
                name: teams.name
            })
            .from(teams)
            .as("away_team_t")

        const upcomingRefMatches = await db
            .select({
                date: matches.date,
                time: matches.time,
                court: matches.court,
                divisionName: divisions.name,
                homeTeamName: homeTeam.name,
                awayTeamName: awayTeam.name
            })
            .from(matchReferees)
            .innerJoin(matches, eq(matchReferees.match_id, matches.id))
            .innerJoin(divisions, eq(matches.division, divisions.id))
            .leftJoin(homeTeam, eq(matches.home_team, homeTeam.id))
            .leftJoin(awayTeam, eq(matches.away_team, awayTeam.id))
            .where(
                and(
                    eq(matchReferees.referee_id, userId),
                    eq(matchReferees.season_id, seasonId),
                    gte(matches.date, todayStr)
                )
            )
            .orderBy(asc(matches.date), asc(matches.time))

        // Filter to only next game night
        if (upcomingRefMatches.length > 0) {
            const nextDate = upcomingRefMatches[0].date
            refUpcomingMatches = upcomingRefMatches
                .filter((m) => m.date === nextDate)
                .map((m) => ({
                    date: m.date ?? "",
                    time: m.time ?? "",
                    court: m.court,
                    divisionName: m.divisionName,
                    homeTeamName: m.homeTeamName ?? "TBD",
                    awayTeamName: m.awayTeamName ?? "TBD"
                }))
        }
    }

    if (isRefCoordinator) {
        // Find next game date and check if fully scheduled
        const nextDateRow = await db
            .select({ date: matches.date })
            .from(matches)
            .where(
                and(eq(matches.season, seasonId), gte(matches.date, todayStr))
            )
            .orderBy(asc(matches.date))
            .limit(1)

        if (nextDateRow.length > 0 && nextDateRow[0].date) {
            const nextDate = nextDateRow[0].date
            const matchesOnDate = await db
                .select({ id: matches.id })
                .from(matches)
                .where(
                    and(
                        eq(matches.season, seasonId),
                        eq(matches.date, nextDate)
                    )
                )

            const assignedOnDate = await db
                .select({ id: matchReferees.id })
                .from(matchReferees)
                .innerJoin(matches, eq(matchReferees.match_id, matches.id))
                .where(
                    and(
                        eq(matchReferees.season_id, seasonId),
                        eq(matches.date, nextDate)
                    )
                )

            const dateObj = new Date(`${nextDate}T00:00:00`)
            refScheduleStatus = {
                nextDateLabel: dateObj.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric"
                }),
                totalMatches: matchesOnDate.length,
                assignedMatches: assignedOnDate.length,
                fullyScheduled: assignedOnDate.length >= matchesOnDate.length
            }
        }
    }

    return {
        refUpcomingMatches,
        isRefForSeason,
        isRefCoordinator,
        refScheduleStatus
    }
}
