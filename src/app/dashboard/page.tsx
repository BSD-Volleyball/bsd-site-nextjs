import { Suspense } from "react"
import { PageHeader } from "@/components/layout/page-header"
import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    drafts,
    teams,
    divisions,
    individual_divisions,
    concerns,
    week1Rosters,
    week2Rosters,
    week3Rosters,
    matchReferees,
    matches
} from "@/database/schema"
import { eq, and, count, or, gte, asc } from "drizzle-orm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    RiCheckLine,
    RiCalendarLine,
    RiCoupon3Line,
    RiStarLine,
    RiAlertLine,
    RiHandHeartLine
} from "@remixicon/react"
import Link from "next/link"
import {
    getEventsByType,
    formatEventDate,
    formatShortDate,
    formatEventTime
} from "@/lib/site-config"
import { isSeasonRegistrationOpen } from "@/lib/season-phases"
import { getActiveDiscountForUser } from "@/lib/discount"
import { getActiveWaiver } from "@/lib/waivers"
import { PreviousSeasonsCard } from "./previous-seasons-card"
import { WelcomeTeamCard } from "./captain-info-card"
import {
    hasCaptainPagesAccessBySession,
    hasPermissionBySession,
    isAdminOrDirectorBySession,
    isCommissionerForSeason,
    getUserRolesForUser
} from "@/lib/rbac"
import {
    getCaptainWelcomeData,
    getPlayerTeamAssignment,
    type CaptainWelcomeData,
    type PlayerTeamAssignment
} from "./roster-actions"
import {
    getNextMatch,
    getPlayoffNextMatches,
    type NextMatch,
    type PlayoffNextMatchData
} from "./next-match-actions"
import { PlayoffNextMatchCard } from "@/components/dashboard/playoff-next-match-card"
import { FriendsCard } from "@/components/dashboard/friends-card"
import {
    getFriendsWithNextMatch,
    type FriendNextMatchEntry
} from "@/lib/friends"
import { playerPicBaseUrl } from "@/config/env"
import { TournamentWaiverCard } from "@/components/dashboard/tournament-waiver-card"
import { TournamentDashboardCard } from "@/components/dashboard/tournament-card"
import { getTournamentWaiverGate } from "@/lib/tournament-config"
import { getTournamentDashboardCard } from "@/lib/tournament-dashboard"
import {
    assignmentNightLabel,
    assignmentTimeLabel,
    getVolunteerAssignmentsForSeason
} from "@/lib/tryout-volunteer-schedule"
import { cn, formatDisplayName } from "@/lib/utils"
import { site } from "@/config/site"
import {
    getSeasonSignup,
    getPreviousSeasonsPlayed,
    getNewPlayerEvalStats,
    getAllDivisionCaptainSelectionStatus,
    getCommissionerCaptainSelectionStatus,
    type CaptainSelectionDivisionStatus
} from "./queries"
import { TeamAssignmentDisplay } from "./components/team-assignment-display"
import { RegistrationConfirmation } from "./components/registration-confirmation"
import { WaitlistContent } from "./components/waitlist-content"
import { WaitlistInterestPanel } from "./components/waitlist-interest-panel"
import { SignupCTA } from "./components/signup-cta"

export type { PreviousSeason } from "./queries"

export const metadata: Metadata = {
    title: "Dashboard"
}

async function PreviousSeasonsSection({ userId }: { userId: string }) {
    const previousSeasons = await getPreviousSeasonsPlayed(userId)
    if (previousSeasons.length === 0) return null
    return <PreviousSeasonsCard previousSeasons={previousSeasons} />
}

export default async function DashboardPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    const activeWaiver = await getActiveWaiver()
    const tournamentWaiverGate = session?.user
        ? await getTournamentWaiverGate(session.user.id)
        : null
    const tournamentCard = session?.user
        ? await getTournamentDashboardCard(session.user.id)
        : null
    const [hasTryoutSheetAccess, isAdmin] = session?.user
        ? await Promise.all([
              hasCaptainPagesAccessBySession(),
              isAdminOrDirectorBySession()
          ])
        : [false, false]
    let isCurrentSeasonCommissioner = false

    let signupStatus = null
    let userName: string | null = null
    let evalStats: { totalNew: number; ratedByUser: number } | null = null
    let discount: Awaited<ReturnType<typeof getActiveDiscountForUser>> = null
    let commissionerCaptainStatuses: CaptainSelectionDivisionStatus[] = []
    let adminCaptainStatuses: CaptainSelectionDivisionStatus[] = []
    let hasWeek1RosterData = false
    let hasWeek2RosterData = false
    let hasWeek3RosterData = false
    let isWeek2Captain = false
    let isSeasonCaptain = false
    let isSeasonCoach = false
    let isDivisionDrafted = false
    let captainWelcomeData: CaptainWelcomeData | null = null
    let playerTeamAssignment: PlayerTeamAssignment | null = null
    let nextMatch: NextMatch | null = null
    let playoffNextMatches: PlayoffNextMatchData | null = null
    let friendsNextMatches: FriendNextMatchEntry[] = []
    let userWeek1Roster: { sessionNumber: number; courtNumber: number } | null =
        null
    let userWeek2Roster: {
        divisionName: string
        teamNumber: number
        captainName: string | null
        courtNumber: number
        sessionTime: string
    } | null = null
    let userWeek3Roster: {
        divisionName: string
        teamNumber: number
        captainName: string | null
        courtNumber: number
        sessionTime: string
    } | null = null
    let tryoutVolunteerJobs: {
        assignmentId: number
        jobName: string
        notes: string | null
        nightLabel: string
        timeLabel: string
    }[] = []
    let assignedActiveConcernsCount = 0
    let refUpcomingMatches: {
        date: string
        time: string
        court: number | null
        divisionName: string
        homeTeamName: string
        awayTeamName: string
    }[] = []
    let isRefForSeason = false
    let isRefCoordinator = false
    let refScheduleStatus: {
        nextDateLabel: string
        totalMatches: number
        assignedMatches: number
        fullyScheduled: boolean
    } | null = null

    if (session?.user) {
        const [signupResult, discountResult, userResult] = await Promise.all([
            getSeasonSignup(session.user.id),
            getActiveDiscountForUser(session.user.id, "season"),
            db
                .select({
                    preferred_name: users.preferred_name,
                    first_name: users.first_name
                })
                .from(users)
                .where(eq(users.id, session.user.id))
                .limit(1)
        ])

        signupStatus = signupResult
        discount = discountResult
        const [user] = userResult
        userName = user?.preferred_name || user?.first_name || null

        const seasonId = signupStatus?.config.seasonId

        friendsNextMatches = await getFriendsWithNextMatch(
            session.user.id,
            seasonId ?? null
        )

        // Run permission check and admin eval stats in parallel — both are independent
        const [canViewConcerns, evalStatsResult] = await Promise.all([
            seasonId
                ? hasPermissionBySession("concerns:view", { seasonId })
                : Promise.resolve(false),
            isAdmin && seasonId
                ? getNewPlayerEvalStats(session.user.id, seasonId)
                : Promise.resolve(null)
        ])

        evalStats = evalStatsResult

        if (canViewConcerns) {
            const [assignedConcernCount] = await db
                .select({ total: count() })
                .from(concerns)
                .where(
                    and(
                        eq(concerns.assigned_to, session.user.id),
                        eq(concerns.status, "active")
                    )
                )

            assignedActiveConcernsCount = assignedConcernCount?.total ?? 0
        }

        if (signupStatus?.config.seasonId) {
            const [
                week1RosterRow,
                week2RosterRow,
                week3RosterRow,
                isCommissioner
            ] = await Promise.all([
                db
                    .select({ id: week1Rosters.id })
                    .from(week1Rosters)
                    .where(
                        eq(week1Rosters.season, signupStatus.config.seasonId)
                    )
                    .limit(1),
                db
                    .select({ id: week2Rosters.id })
                    .from(week2Rosters)
                    .where(
                        eq(week2Rosters.season, signupStatus.config.seasonId)
                    )
                    .limit(1),
                db
                    .select({ id: week3Rosters.id })
                    .from(week3Rosters)
                    .where(
                        eq(week3Rosters.season, signupStatus.config.seasonId)
                    )
                    .limit(1),
                isCommissionerForSeason(
                    session.user.id,
                    signupStatus.config.seasonId
                )
            ])
            hasWeek1RosterData = !!week1RosterRow[0]
            hasWeek2RosterData = !!week2RosterRow[0]
            hasWeek3RosterData = !!week3RosterRow[0]
            isCurrentSeasonCommissioner = isCommissioner

            if (signupStatus.config.phase === "prep_tryout_week_1") {
                const [myWeek1Slot] = await db
                    .select({
                        sessionNumber: week1Rosters.session_number,
                        courtNumber: week1Rosters.court_number
                    })
                    .from(week1Rosters)
                    .where(
                        and(
                            eq(
                                week1Rosters.season,
                                signupStatus.config.seasonId
                            ),
                            eq(week1Rosters.user, session.user.id)
                        )
                    )
                    .limit(1)
                userWeek1Roster = myWeek1Slot ?? null
            }

            if (
                signupStatus.config.phase === "prep_tryout_week_3" &&
                hasWeek2RosterData
            ) {
                const [week2CaptainEntry] = await db
                    .select({ userId: week2Rosters.user })
                    .from(week2Rosters)
                    .where(
                        and(
                            eq(
                                week2Rosters.season,
                                signupStatus.config.seasonId
                            ),
                            eq(week2Rosters.user, session.user.id),
                            eq(week2Rosters.is_captain, true)
                        )
                    )
                    .limit(1)
                isWeek2Captain = !!week2CaptainEntry
            }

            if (
                [
                    "prep_tryout_week_3",
                    "draft",
                    "regular_season",
                    "playoffs"
                ].includes(signupStatus.config.phase)
            ) {
                const [captainTeamEntry] = await db
                    .select({ id: teams.id, divisionId: teams.division })
                    .from(teams)
                    .where(
                        and(
                            eq(teams.season, signupStatus.config.seasonId),
                            eq(teams.captain, session.user.id)
                        )
                    )
                    .limit(1)
                isSeasonCaptain = !!captainTeamEntry

                // Check for coaches (captain or captain2 in a coaches-mode division)
                let teamCardEntry = captainTeamEntry
                if (!isSeasonCaptain) {
                    const [coachTeamEntry] = await db
                        .select({ id: teams.id, divisionId: teams.division })
                        .from(teams)
                        .innerJoin(
                            individual_divisions,
                            and(
                                eq(
                                    individual_divisions.season,
                                    signupStatus.config.seasonId
                                ),
                                eq(
                                    individual_divisions.division,
                                    teams.division
                                ),
                                eq(individual_divisions.coaches, true)
                            )
                        )
                        .where(
                            and(
                                eq(teams.season, signupStatus.config.seasonId),
                                or(
                                    eq(teams.captain, session.user.id),
                                    eq(teams.captain2, session.user.id)
                                )
                            )
                        )
                        .limit(1)
                    isSeasonCoach = !!coachTeamEntry
                    teamCardEntry = coachTeamEntry
                }

                if ((isSeasonCaptain || isSeasonCoach) && teamCardEntry) {
                    const [draftRecord] = await db
                        .select({ id: drafts.id })
                        .from(drafts)
                        .innerJoin(teams, eq(drafts.team, teams.id))
                        .where(
                            and(
                                eq(teams.season, signupStatus.config.seasonId),
                                eq(teams.division, teamCardEntry.divisionId)
                            )
                        )
                        .limit(1)
                    isDivisionDrafted = !!draftRecord
                }

                if ((isSeasonCaptain || isSeasonCoach) && isDivisionDrafted) {
                    captainWelcomeData = await getCaptainWelcomeData()
                }
            }

            if (
                ["draft", "regular_season", "playoffs", "complete"].includes(
                    signupStatus.config.phase
                )
            ) {
                playerTeamAssignment = await getPlayerTeamAssignment(
                    session.user.id,
                    signupStatus.config.seasonId
                )
            }

            if (
                ["draft", "regular_season", "playoffs"].includes(
                    signupStatus.config.phase
                )
            ) {
                nextMatch = await getNextMatch(
                    session.user.id,
                    signupStatus.config.seasonId
                )
            }

            if (signupStatus.config.phase === "playoffs") {
                playoffNextMatches = await getPlayoffNextMatches(
                    session.user.id,
                    signupStatus.config.seasonId
                )
            }

            if (
                signupStatus.config.phase === "prep_tryout_week_2" &&
                hasWeek2RosterData
            ) {
                const [myWeek2Slot] = await db
                    .select({
                        divisionId: week2Rosters.division,
                        divisionName: divisions.name,
                        teamNumber: week2Rosters.team_number
                    })
                    .from(week2Rosters)
                    .innerJoin(
                        divisions,
                        eq(week2Rosters.division, divisions.id)
                    )
                    .where(
                        and(
                            eq(
                                week2Rosters.season,
                                signupStatus.config.seasonId
                            ),
                            eq(week2Rosters.user, session.user.id)
                        )
                    )
                    .limit(1)

                if (myWeek2Slot) {
                    const legacyCourtByDivision: Record<string, number> = {
                        AA: 1,
                        A: 2,
                        ABA: 3,
                        ABB: 4,
                        BB: 7,
                        BBB: 8
                    }

                    const [[captainRow], week2Divisions] = await Promise.all([
                        db
                            .select({
                                firstName: users.first_name,
                                lastName: users.last_name,
                                preferredName: users.preferred_name
                            })
                            .from(week2Rosters)
                            .innerJoin(users, eq(week2Rosters.user, users.id))
                            .where(
                                and(
                                    eq(
                                        week2Rosters.season,
                                        signupStatus.config.seasonId
                                    ),
                                    eq(
                                        week2Rosters.division,
                                        myWeek2Slot.divisionId
                                    ),
                                    eq(
                                        week2Rosters.team_number,
                                        myWeek2Slot.teamNumber
                                    ),
                                    eq(week2Rosters.is_captain, true)
                                )
                            )
                            .limit(1),
                        db
                            .selectDistinct({
                                id: divisions.id,
                                level: divisions.level
                            })
                            .from(week2Rosters)
                            .innerJoin(
                                divisions,
                                eq(week2Rosters.division, divisions.id)
                            )
                            .where(
                                eq(
                                    week2Rosters.season,
                                    signupStatus.config.seasonId
                                )
                            )
                            .orderBy(divisions.level)
                    ])

                    const divisionIndex = week2Divisions.findIndex(
                        (d) => d.id === myWeek2Slot.divisionId
                    )
                    const courtNumber =
                        legacyCourtByDivision[myWeek2Slot.divisionName] ??
                        (divisionIndex >= 0 ? divisionIndex + 1 : 1)

                    const tryout2Events = getEventsByType(
                        signupStatus.config,
                        "tryout"
                    )
                    const tryout2TimeSlots = tryout2Events[1]?.timeSlots ?? []
                    const sessionTimes = tryout2TimeSlots.map(
                        (ts) => ts.startTime
                    )
                    const matchupIndex = Math.floor(
                        (myWeek2Slot.teamNumber - 1) / 2
                    )
                    const sessionTime = sessionTimes[matchupIndex] || "TBD"

                    const captainName = captainRow
                        ? formatDisplayName(
                              captainRow.firstName,
                              captainRow.lastName,
                              captainRow.preferredName
                          )
                        : null

                    userWeek2Roster = {
                        divisionName: myWeek2Slot.divisionName,
                        teamNumber: myWeek2Slot.teamNumber,
                        captainName,
                        courtNumber,
                        sessionTime
                    }
                }
            }

            if (
                signupStatus.config.phase === "prep_tryout_week_3" &&
                hasWeek3RosterData
            ) {
                const [myWeek3Slot] = await db
                    .select({
                        divisionId: week3Rosters.division,
                        divisionName: divisions.name,
                        teamNumber: week3Rosters.team_number
                    })
                    .from(week3Rosters)
                    .innerJoin(
                        divisions,
                        eq(week3Rosters.division, divisions.id)
                    )
                    .where(
                        and(
                            eq(
                                week3Rosters.season,
                                signupStatus.config.seasonId
                            ),
                            eq(week3Rosters.user, session.user.id)
                        )
                    )
                    .limit(1)

                if (myWeek3Slot) {
                    const legacyCourtByDivision: Record<string, number> = {
                        AA: 1,
                        A: 2,
                        ABA: 3,
                        ABB: 4,
                        BB: 7,
                        BBB: 8
                    }

                    const [[captainRow], week3Divisions] = await Promise.all([
                        db
                            .select({
                                firstName: users.first_name,
                                lastName: users.last_name,
                                preferredName: users.preferred_name
                            })
                            .from(week3Rosters)
                            .innerJoin(users, eq(week3Rosters.user, users.id))
                            .where(
                                and(
                                    eq(
                                        week3Rosters.season,
                                        signupStatus.config.seasonId
                                    ),
                                    eq(
                                        week3Rosters.division,
                                        myWeek3Slot.divisionId
                                    ),
                                    eq(
                                        week3Rosters.team_number,
                                        myWeek3Slot.teamNumber
                                    ),
                                    eq(week3Rosters.is_captain, true)
                                )
                            )
                            .limit(1),
                        db
                            .selectDistinct({
                                id: divisions.id,
                                level: divisions.level
                            })
                            .from(week3Rosters)
                            .innerJoin(
                                divisions,
                                eq(week3Rosters.division, divisions.id)
                            )
                            .where(
                                eq(
                                    week3Rosters.season,
                                    signupStatus.config.seasonId
                                )
                            )
                            .orderBy(divisions.level)
                    ])

                    const divisionIndex = week3Divisions.findIndex(
                        (d) => d.id === myWeek3Slot.divisionId
                    )
                    const courtNumber =
                        legacyCourtByDivision[myWeek3Slot.divisionName] ??
                        (divisionIndex >= 0 ? divisionIndex + 1 : 1)

                    const tryout3Events = getEventsByType(
                        signupStatus.config,
                        "tryout"
                    )
                    const tryout3TimeSlots = tryout3Events[2]?.timeSlots ?? []
                    const sessionTimes = tryout3TimeSlots.map(
                        (ts) => ts.startTime
                    )
                    const matchupIndex = Math.floor(
                        (myWeek3Slot.teamNumber - 1) / 2
                    )
                    const sessionTime = sessionTimes[matchupIndex] || "TBD"

                    const captainName = captainRow
                        ? formatDisplayName(
                              captainRow.firstName,
                              captainRow.lastName,
                              captainRow.preferredName
                          )
                        : null

                    userWeek3Roster = {
                        divisionName: myWeek3Slot.divisionName,
                        teamNumber: myWeek3Slot.teamNumber,
                        captainName,
                        courtNumber,
                        sessionTime
                    }
                }
            }

            if (signupStatus.config.phase === "select_captains") {
                if (isAdmin) {
                    adminCaptainStatuses =
                        await getAllDivisionCaptainSelectionStatus(
                            signupStatus.config.seasonId
                        )
                } else if (isCurrentSeasonCommissioner) {
                    commissionerCaptainStatuses =
                        await getCommissionerCaptainSelectionStatus(
                            session.user.id,
                            signupStatus.config.seasonId
                        )
                }
            }
        }
    }

    // Tryout volunteer jobs this player has been assigned
    if (session?.user && signupStatus?.config.seasonId) {
        const assignments = await getVolunteerAssignmentsForSeason(
            signupStatus.config.seasonId
        )
        tryoutVolunteerJobs = assignments
            .filter((a) => a.userId === session.user.id)
            .map((a) => ({
                assignmentId: a.assignmentId,
                jobName: a.jobName,
                notes: a.jobNotes,
                nightLabel: assignmentNightLabel(a),
                timeLabel: assignmentTimeLabel(a)
            }))
    }

    // Ref dashboard card data
    if (
        session?.user &&
        signupStatus?.config.seasonId &&
        ["regular_season", "playoffs", "complete"].includes(
            signupStatus.config.phase
        )
    ) {
        const seasonId = signupStatus.config.seasonId
        const todayStr = new Date().toISOString().slice(0, 10)

        const [refCheck, userRoles] = await Promise.all([
            hasPermissionBySession("schedule:view", { seasonId }),
            session?.user
                ? getUserRolesForUser(session.user.id)
                : Promise.resolve([])
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
                        eq(matchReferees.referee_id, session.user.id),
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
                    and(
                        eq(matches.season, seasonId),
                        gte(matches.date, todayStr)
                    )
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
                    fullyScheduled:
                        assignedOnDate.length >= matchesOnDate.length
                }
            }
        }
    }

    const seasonLabel = signupStatus
        ? `${signupStatus.config.seasonName.charAt(0).toUpperCase() + signupStatus.config.seasonName.slice(1)} ${signupStatus.config.seasonYear}`
        : null

    const waitlistSeasonId = signupStatus?.season?.id ?? null
    const hasCompletedNewPlayerEvaluations = !!(
        evalStats &&
        evalStats.totalNew > 0 &&
        evalStats.ratedByUser >= evalStats.totalNew
    )
    const commissionerDivisionsCompleted = commissionerCaptainStatuses.filter(
        (status) => status.isComplete
    ).length
    const commissionerAllDivisionsCompleted =
        commissionerCaptainStatuses.length > 0 &&
        commissionerDivisionsCompleted === commissionerCaptainStatuses.length
    const adminDivisionsCompleted = adminCaptainStatuses.filter(
        (status) => status.isComplete
    ).length
    const adminAllDivisionsCompleted =
        adminCaptainStatuses.length > 0 &&
        adminDivisionsCompleted === adminCaptainStatuses.length
    const adminCompletedDivisionNames = adminCaptainStatuses
        .filter((status) => status.isComplete)
        .map((status) => status.divisionName)
        .join(", ")
    const adminPendingDivisionNames = adminCaptainStatuses
        .filter((status) => !status.isComplete)
        .map((status) => status.divisionName)
        .join(", ")
    const shouldShowWeek1TryoutSheetsCard = !!(
        hasTryoutSheetAccess &&
        signupStatus &&
        ["select_captains", "prep_tryout_week_1"].includes(
            signupStatus.config.phase
        ) &&
        hasWeek1RosterData
    )
    const shouldShowWeek2TryoutSheetsCard = !!(
        hasTryoutSheetAccess &&
        signupStatus &&
        signupStatus.config.phase === "prep_tryout_week_2" &&
        hasWeek2RosterData
    )
    const shouldShowWeek3TryoutSheetsCard = !!(
        hasTryoutSheetAccess &&
        signupStatus &&
        signupStatus.config.phase === "prep_tryout_week_3" &&
        hasWeek3RosterData
    )
    const shouldShowWeek1NametagCard = !!(
        isAdmin &&
        signupStatus &&
        ["select_captains", "prep_tryout_week_1"].includes(
            signupStatus.config.phase
        ) &&
        hasWeek1RosterData
    )
    const shouldShowWeek2NametagCard = !!(
        isAdmin &&
        signupStatus &&
        signupStatus.config.phase === "prep_tryout_week_2" &&
        hasWeek2RosterData
    )
    const shouldShowWeek3NametagCard = !!(
        isAdmin &&
        signupStatus &&
        signupStatus.config.phase === "prep_tryout_week_3" &&
        hasWeek3RosterData
    )
    const shouldShowRatePlayersCard = !!(
        signupStatus &&
        ["prep_tryout_week_2", "prep_tryout_week_3"].includes(
            signupStatus.config.phase
        ) &&
        (isAdmin || isCurrentSeasonCommissioner || hasTryoutSheetAccess)
    )
    const shouldShowWeek2HomeworkCard = !!(
        signupStatus &&
        signupStatus.config.phase === "prep_tryout_week_3" &&
        isWeek2Captain
    )
    const shouldShowDraftHomeworkCard = !!(
        signupStatus &&
        ["prep_tryout_week_3", "draft"].includes(signupStatus.config.phase) &&
        isSeasonCaptain &&
        !isDivisionDrafted
    )
    const shouldShowWelcomeTeamCard = !!(
        signupStatus &&
        [
            "prep_tryout_week_3",
            "draft",
            "regular_season",
            "playoffs",
            "complete"
        ].includes(signupStatus.config.phase) &&
        (isSeasonCaptain || isSeasonCoach) &&
        isDivisionDrafted &&
        captainWelcomeData
    )
    const shouldShowAssignedConcernsCard = assignedActiveConcernsCount > 0

    const greeting = userName
        ? `Hi ${userName}, Welcome back 👋`
        : "Hi, Welcome back 👋"

    return (
        <div className="space-y-6">
            <PageHeader
                title={greeting}
                description="Here's what's happening with your account today."
            />

            <div className="flex flex-wrap gap-6">
                {tournamentWaiverGate && activeWaiver && (
                    <TournamentWaiverCard
                        tournamentName={tournamentWaiverGate.tournamentName}
                        waiver={activeWaiver}
                    />
                )}
                {tournamentCard && (
                    <TournamentDashboardCard data={tournamentCard} />
                )}
                {playoffNextMatches && (
                    <PlayoffNextMatchCard data={playoffNextMatches} />
                )}
                {friendsNextMatches.length > 0 && (
                    <FriendsCard
                        data={{
                            playerPicUrl: playerPicBaseUrl(),
                            friends: friendsNextMatches
                        }}
                    />
                )}
                {!playoffNextMatches && nextMatch && (
                    <Card className="min-w-[280px] flex-1 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <RiCalendarLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                <CardTitle className="text-blue-700 text-lg dark:text-blue-300">
                                    Your Next Match
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="space-y-1.5 rounded-md bg-blue-100 p-3 text-sm dark:bg-blue-900">
                                <div className="flex justify-between">
                                    <span className="text-blue-700 dark:text-blue-300">
                                        Date:
                                    </span>
                                    <span className="font-semibold text-blue-800 dark:text-blue-200">
                                        {formatShortDate(nextMatch.date)}
                                    </span>
                                </div>
                                {nextMatch.time && (
                                    <div className="flex justify-between">
                                        <span className="text-blue-700 dark:text-blue-300">
                                            Time:
                                        </span>
                                        <span className="font-semibold text-blue-800 dark:text-blue-200">
                                            {nextMatch.time}
                                        </span>
                                    </div>
                                )}
                                {nextMatch.court !== null && (
                                    <div className="flex justify-between">
                                        <span className="text-blue-700 dark:text-blue-300">
                                            Court:
                                        </span>
                                        <span className="font-semibold text-blue-800 dark:text-blue-200">
                                            Court {nextMatch.court}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-blue-700 dark:text-blue-300">
                                        Opponent:
                                    </span>
                                    <span className="font-semibold text-blue-800 dark:text-blue-200">
                                        {nextMatch.opponentName}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-blue-700 dark:text-blue-300">
                                        Division:
                                    </span>
                                    <span className="font-semibold text-blue-800 dark:text-blue-200">
                                        {nextMatch.divisionName}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-blue-700 dark:text-blue-300">
                                        Availability:
                                    </span>
                                    <span
                                        className={
                                            nextMatch.isUnavailable
                                                ? "font-semibold text-red-600 dark:text-red-400"
                                                : "font-semibold text-green-700 dark:text-green-400"
                                        }
                                    >
                                        {nextMatch.isUnavailable
                                            ? "Not Available"
                                            : "Available"}
                                    </span>
                                </div>
                            </div>
                            <p className="text-blue-600 text-xs dark:text-blue-400">
                                {nextMatch.isUnavailable
                                    ? "You've marked this date as unavailable. If you can now make it, "
                                    : "Can't make this match? "}
                                <Link
                                    href="/dashboard/my-availability"
                                    className="underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-200"
                                >
                                    update your availability
                                </Link>
                                {nextMatch.isUnavailable
                                    ? "."
                                    : " so your captain knows."}
                            </p>
                            <Link
                                href="/dashboard/season-schedule"
                                className="block text-center text-blue-700 text-sm underline underline-offset-4 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-200"
                            >
                                View Full Schedule →
                            </Link>
                        </CardContent>
                    </Card>
                )}
                {/* Referee Dashboard Cards */}
                {isRefForSeason && refUpcomingMatches.length > 0 && (
                    <Card className="min-w-[280px] flex-1 border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <RiCalendarLine className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                                <CardTitle className="text-lg text-teal-700 dark:text-teal-300">
                                    Your Upcoming Ref Assignments
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-sm text-teal-700 dark:text-teal-300">
                                You have {refUpcomingMatches.length} match
                                {refUpcomingMatches.length !== 1 ? "es" : ""} to
                                ref on{" "}
                                {new Date(
                                    `${refUpcomingMatches[0].date}T00:00:00`
                                ).toLocaleDateString("en-US", {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric"
                                })}
                                .
                            </p>
                            <div className="space-y-2">
                                {refUpcomingMatches.map((m, i) => (
                                    <div
                                        key={`ref-match-${m.court}-${m.time}-${i}`}
                                        className="rounded-md bg-teal-100 p-2 text-sm text-teal-800 dark:bg-teal-900 dark:text-teal-200"
                                    >
                                        <span className="font-medium">
                                            {m.divisionName}
                                        </span>{" "}
                                        — Court {m.court},{" "}
                                        {m.time
                                            ? new Date(
                                                  `2000-01-01T${m.time}`
                                              ).toLocaleTimeString("en-US", {
                                                  hour: "numeric",
                                                  minute: "2-digit"
                                              })
                                            : "TBD"}
                                        <br />
                                        {m.homeTeamName} vs {m.awayTeamName}
                                    </div>
                                ))}
                            </div>
                            <Link
                                href="/dashboard/reffing-schedule"
                                className="inline-flex items-center justify-center rounded-md bg-teal-600 px-4 py-2 font-medium text-sm text-white hover:bg-teal-700"
                            >
                                View Full Schedule
                            </Link>
                        </CardContent>
                    </Card>
                )}
                {isRefCoordinator && refScheduleStatus && (
                    <Card
                        className={cn(
                            "min-w-[280px] flex-1",
                            refScheduleStatus.fullyScheduled
                                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                                : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
                        )}
                    >
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                {refScheduleStatus.fullyScheduled ? (
                                    <RiCheckLine className="h-5 w-5 text-green-600 dark:text-green-400" />
                                ) : (
                                    <RiAlertLine className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                )}
                                <CardTitle
                                    className={cn(
                                        "text-lg",
                                        refScheduleStatus.fullyScheduled
                                            ? "text-green-700 dark:text-green-300"
                                            : "text-amber-700 dark:text-amber-300"
                                    )}
                                >
                                    Ref Scheduling —{" "}
                                    {refScheduleStatus.nextDateLabel}
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p
                                className={cn(
                                    "text-sm",
                                    refScheduleStatus.fullyScheduled
                                        ? "text-green-700 dark:text-green-300"
                                        : "text-amber-700 dark:text-amber-300"
                                )}
                            >
                                {refScheduleStatus.fullyScheduled
                                    ? `All ${refScheduleStatus.totalMatches} matches are fully staffed with referees.`
                                    : `${refScheduleStatus.assignedMatches} of ${refScheduleStatus.totalMatches} matches have refs assigned. ${refScheduleStatus.totalMatches - refScheduleStatus.assignedMatches} still need attention.`}
                            </p>
                            <Link
                                href="/dashboard/schedule-refs"
                                className={cn(
                                    "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium text-sm text-white",
                                    refScheduleStatus.fullyScheduled
                                        ? "bg-green-600 hover:bg-green-700"
                                        : "bg-amber-600 hover:bg-amber-700"
                                )}
                            >
                                {refScheduleStatus.fullyScheduled
                                    ? "View Schedule"
                                    : "Finish Scheduling"}
                            </Link>
                        </CardContent>
                    </Card>
                )}
                {userWeek3Roster && signupStatus && (
                    <Card className="min-w-[280px] flex-1 border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <RiCalendarLine className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                                <CardTitle className="text-lg text-orange-700 dark:text-orange-300">
                                    You're in Week 3 Tryouts this Thursday!
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-orange-700 text-sm dark:text-orange-300">
                                You have been assigned a spot in the Pre-Season
                                Week 3 tryout.
                            </p>
                            <div className="space-y-1.5 rounded-md bg-orange-100 p-3 text-sm dark:bg-orange-900">
                                {getEventsByType(
                                    signupStatus.config,
                                    "tryout"
                                )[2]?.eventDate && (
                                    <div className="flex justify-between">
                                        <span className="text-orange-700 dark:text-orange-300">
                                            Date:
                                        </span>
                                        <span className="font-semibold text-orange-800 dark:text-orange-200">
                                            {formatEventDate(
                                                getEventsByType(
                                                    signupStatus.config,
                                                    "tryout"
                                                )[2]!.eventDate
                                            )}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-orange-700 dark:text-orange-300">
                                        Time:
                                    </span>
                                    <span className="font-semibold text-orange-800 dark:text-orange-200">
                                        {userWeek3Roster.sessionTime}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-orange-700 dark:text-orange-300">
                                        Court:
                                    </span>
                                    <span className="font-semibold text-orange-800 dark:text-orange-200">
                                        Court {userWeek3Roster.courtNumber}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-orange-700 dark:text-orange-300">
                                        Division:
                                    </span>
                                    <span className="font-semibold text-orange-800 dark:text-orange-200">
                                        {userWeek3Roster.divisionName}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-orange-700 dark:text-orange-300">
                                        Team:
                                    </span>
                                    <span className="font-semibold text-orange-800 dark:text-orange-200">
                                        Team {userWeek3Roster.teamNumber}
                                    </span>
                                </div>
                                {userWeek3Roster.captainName && (
                                    <div className="flex justify-between">
                                        <span className="text-orange-700 dark:text-orange-300">
                                            Captain:
                                        </span>
                                        <span className="font-semibold text-orange-800 dark:text-orange-200">
                                            {userWeek3Roster.captainName}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <p className="text-orange-600 text-xs dark:text-orange-400">
                                Please plan to arrive 10 minutes early.
                            </p>
                            <Link
                                href="/dashboard/preseason-week-3"
                                className="inline-flex items-center justify-center rounded-md bg-orange-600 px-4 py-2 font-medium text-sm text-white hover:bg-orange-700"
                            >
                                View Full Week 3 Roster
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {!isAdmin &&
                    isCurrentSeasonCommissioner &&
                    signupStatus?.config.phase === "select_captains" && (
                        <Card
                            className={cn(
                                "min-w-[280px] flex-1",
                                commissionerAllDivisionsCompleted
                                    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                                    : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
                            )}
                        >
                            <CardHeader className="pb-2">
                                <CardTitle
                                    className={cn(
                                        "text-lg",
                                        commissionerAllDivisionsCompleted
                                            ? "text-green-700 dark:text-green-300"
                                            : "text-amber-700 dark:text-amber-300"
                                    )}
                                >
                                    Time to Select Captains
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <p
                                    className={cn(
                                        "text-sm",
                                        commissionerAllDivisionsCompleted
                                            ? "text-green-700 dark:text-green-300"
                                            : "text-amber-700 dark:text-amber-300"
                                    )}
                                >
                                    {commissionerAllDivisionsCompleted
                                        ? "Great work. You've completed captain selection for all of your assigned divisions."
                                        : `Captain selection is complete in ${commissionerDivisionsCompleted} of ${commissionerCaptainStatuses.length} assigned divisions.`}
                                </p>
                                {commissionerCaptainStatuses.length > 0 && (
                                    <p
                                        className={cn(
                                            "text-sm",
                                            commissionerAllDivisionsCompleted
                                                ? "text-green-700 dark:text-green-300"
                                                : "text-amber-700 dark:text-amber-300"
                                        )}
                                    >
                                        {commissionerCaptainStatuses
                                            .map(
                                                (status) =>
                                                    `${status.divisionName} (${status.teamsWithCaptain}/${status.requiredTeams})`
                                            )
                                            .join(", ")}
                                    </p>
                                )}
                                <Link
                                    href="/dashboard/select-captains"
                                    className={cn(
                                        "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium text-sm text-white",
                                        commissionerAllDivisionsCompleted
                                            ? "bg-green-600 hover:bg-green-700"
                                            : "bg-amber-600 hover:bg-amber-700"
                                    )}
                                >
                                    Select Captains
                                </Link>
                            </CardContent>
                        </Card>
                    )}

                {isAdmin &&
                    signupStatus?.config.phase === "select_captains" && (
                        <Card
                            className={cn(
                                "min-w-[280px] flex-1",
                                adminAllDivisionsCompleted
                                    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                                    : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
                            )}
                        >
                            <CardHeader className="pb-2">
                                <CardTitle
                                    className={cn(
                                        "text-lg",
                                        adminAllDivisionsCompleted
                                            ? "text-green-700 dark:text-green-300"
                                            : "text-amber-700 dark:text-amber-300"
                                    )}
                                >
                                    Time to Select Captains
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <p
                                    className={cn(
                                        "text-sm",
                                        adminAllDivisionsCompleted
                                            ? "text-green-700 dark:text-green-300"
                                            : "text-amber-700 dark:text-amber-300"
                                    )}
                                >
                                    {adminAllDivisionsCompleted
                                        ? "All divisions have selected captains. Great work, and it's time to move the season to the next phase."
                                        : `Captain selection is complete in ${adminDivisionsCompleted} of ${adminCaptainStatuses.length} divisions.`}
                                </p>
                                <p
                                    className={cn(
                                        "text-sm",
                                        adminAllDivisionsCompleted
                                            ? "text-green-700 dark:text-green-300"
                                            : "text-amber-700 dark:text-amber-300"
                                    )}
                                >
                                    Completed divisions:{" "}
                                    {adminCompletedDivisionNames || "None yet"}
                                </p>
                                <p
                                    className={cn(
                                        "text-sm",
                                        adminAllDivisionsCompleted
                                            ? "text-green-700 dark:text-green-300"
                                            : "text-amber-700 dark:text-amber-300"
                                    )}
                                >
                                    Pending divisions:{" "}
                                    {adminPendingDivisionNames || "None"}
                                </p>
                                <Link
                                    href="/dashboard/select-captains"
                                    className={cn(
                                        "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium text-sm text-white",
                                        adminAllDivisionsCompleted
                                            ? "bg-green-600 hover:bg-green-700"
                                            : "bg-amber-600 hover:bg-amber-700"
                                    )}
                                >
                                    Select Captains
                                </Link>
                            </CardContent>
                        </Card>
                    )}

                {isAdmin &&
                    evalStats &&
                    signupStatus &&
                    [
                        "registration_open",
                        "select_commissioners",
                        "select_captains",
                        "prep_tryout_week_1"
                    ].includes(signupStatus.config.phase) && (
                        <Card
                            className={cn(
                                "min-w-[280px] flex-1",
                                hasCompletedNewPlayerEvaluations
                                    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                                    : "border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950"
                            )}
                        >
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-2">
                                    <RiStarLine
                                        className={cn(
                                            "h-5 w-5",
                                            hasCompletedNewPlayerEvaluations
                                                ? "text-green-600 dark:text-green-400"
                                                : "text-purple-600 dark:text-purple-400"
                                        )}
                                    />
                                    <CardTitle
                                        className={cn(
                                            "text-lg",
                                            hasCompletedNewPlayerEvaluations
                                                ? "text-green-700 dark:text-green-300"
                                                : "text-purple-700 dark:text-purple-300"
                                        )}
                                    >
                                        Evaluate New Players
                                    </CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <p
                                    className={cn(
                                        "text-sm",
                                        hasCompletedNewPlayerEvaluations
                                            ? "text-green-700 dark:text-green-300"
                                            : "text-purple-700 dark:text-purple-300"
                                    )}
                                >
                                    {hasCompletedNewPlayerEvaluations
                                        ? `Great work. You have evaluated all ${evalStats.totalNew} current new players.`
                                        : `There are ${evalStats.totalNew} new players this season. You've evaluated ${evalStats.ratedByUser} of ${evalStats.totalNew}.`}
                                </p>
                                <Link
                                    href="/dashboard/evaluate-players"
                                    className={cn(
                                        "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium text-sm text-white",
                                        hasCompletedNewPlayerEvaluations
                                            ? "bg-green-600 hover:bg-green-700"
                                            : "bg-purple-600 hover:bg-purple-700"
                                    )}
                                >
                                    Evaluate New Players
                                </Link>
                            </CardContent>
                        </Card>
                    )}

                {shouldShowAssignedConcernsCard && (
                    <Card className="min-w-[280px] flex-1 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-amber-900 text-lg dark:text-amber-100">
                                Active Concerns Assigned
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-amber-800 text-sm dark:text-amber-200">
                                You have {assignedActiveConcernsCount} active{" "}
                                {assignedActiveConcernsCount === 1
                                    ? "concern"
                                    : "concerns"}{" "}
                                assigned to you.
                            </p>
                            <Link
                                href="/dashboard/manage-concerns"
                                className="inline-flex items-center justify-center rounded-md bg-amber-700 px-4 py-2 font-medium text-sm text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
                            >
                                Open Manage Concerns
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {shouldShowWeek2HomeworkCard && (
                    <Card className="min-w-[280px] flex-1 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-blue-700 text-lg dark:text-blue-300">
                                Submit Your Week 2 Homework
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-blue-700 text-sm dark:text-blue-300">
                                As a Week 2 captain, please submit your player
                                movement recommendations by Monday morning.
                            </p>
                            <Link
                                href="/dashboard/week-2-homework"
                                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                            >
                                Go to Week 2 Homework
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {shouldShowDraftHomeworkCard && (
                    <Card className="min-w-[280px] flex-1 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-blue-700 text-lg dark:text-blue-300">
                                Complete Your Draft Homework
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-blue-700 text-sm dark:text-blue-300">
                                As a captain, please review the available
                                players and plan your draft picks before the
                                live draft begins.
                            </p>
                            <Link
                                href="/dashboard/draft-homework"
                                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                            >
                                Go to Draft Homework
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {shouldShowWelcomeTeamCard && captainWelcomeData && (
                    <WelcomeTeamCard data={captainWelcomeData} />
                )}

                {tryoutVolunteerJobs.length > 0 && (
                    <Card className="min-w-[280px] flex-1 border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <RiHandHeartLine className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                <CardTitle className="text-lg text-purple-700 dark:text-purple-300">
                                    You're volunteering at tryouts
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-purple-700 text-sm dark:text-purple-300">
                                Thank you for helping run tryouts! Here
                                {tryoutVolunteerJobs.length === 1
                                    ? "'s your job"
                                    : " are your jobs"}
                                :
                            </p>
                            {tryoutVolunteerJobs.map((job) => (
                                <div
                                    key={job.assignmentId}
                                    className="space-y-1.5 rounded-md bg-purple-100 p-3 text-sm dark:bg-purple-900"
                                >
                                    <div className="flex justify-between gap-2">
                                        <span className="text-purple-700 dark:text-purple-300">
                                            Job:
                                        </span>
                                        <span className="text-right font-semibold text-purple-800 dark:text-purple-200">
                                            {job.jobName}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                        <span className="text-purple-700 dark:text-purple-300">
                                            Date:
                                        </span>
                                        <span className="text-right font-semibold text-purple-800 dark:text-purple-200">
                                            {job.nightLabel}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                        <span className="text-purple-700 dark:text-purple-300">
                                            Time:
                                        </span>
                                        <span className="text-right font-semibold text-purple-800 dark:text-purple-200">
                                            {job.timeLabel}
                                        </span>
                                    </div>
                                    {job.notes && (
                                        <p className="text-purple-600 text-xs dark:text-purple-400">
                                            {job.notes}
                                        </p>
                                    )}
                                </div>
                            ))}
                            <p className="text-purple-600 text-xs dark:text-purple-400">
                                Please plan to arrive 10 minutes early.
                            </p>
                        </CardContent>
                    </Card>
                )}

                {userWeek2Roster && signupStatus && (
                    <Card className="min-w-[280px] flex-1 border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <RiCalendarLine className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                                <CardTitle className="text-lg text-orange-700 dark:text-orange-300">
                                    You're in Week 2 Tryouts this Thursday!
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-orange-700 text-sm dark:text-orange-300">
                                You have been assigned a spot in the Pre-Season
                                Week 2 tryout.
                            </p>
                            <div className="space-y-1.5 rounded-md bg-orange-100 p-3 text-sm dark:bg-orange-900">
                                {getEventsByType(
                                    signupStatus.config,
                                    "tryout"
                                )[1]?.eventDate && (
                                    <div className="flex justify-between">
                                        <span className="text-orange-700 dark:text-orange-300">
                                            Date:
                                        </span>
                                        <span className="font-semibold text-orange-800 dark:text-orange-200">
                                            {formatEventDate(
                                                getEventsByType(
                                                    signupStatus.config,
                                                    "tryout"
                                                )[1]!.eventDate
                                            )}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-orange-700 dark:text-orange-300">
                                        Time:
                                    </span>
                                    <span className="font-semibold text-orange-800 dark:text-orange-200">
                                        {userWeek2Roster.sessionTime}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-orange-700 dark:text-orange-300">
                                        Court:
                                    </span>
                                    <span className="font-semibold text-orange-800 dark:text-orange-200">
                                        Court {userWeek2Roster.courtNumber}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-orange-700 dark:text-orange-300">
                                        Division:
                                    </span>
                                    <span className="font-semibold text-orange-800 dark:text-orange-200">
                                        {userWeek2Roster.divisionName}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-orange-700 dark:text-orange-300">
                                        Team:
                                    </span>
                                    <span className="font-semibold text-orange-800 dark:text-orange-200">
                                        Team {userWeek2Roster.teamNumber}
                                    </span>
                                </div>
                                {userWeek2Roster.captainName && (
                                    <div className="flex justify-between">
                                        <span className="text-orange-700 dark:text-orange-300">
                                            Captain:
                                        </span>
                                        <span className="font-semibold text-orange-800 dark:text-orange-200">
                                            {userWeek2Roster.captainName}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <p className="text-orange-600 text-xs dark:text-orange-400">
                                Please plan to arrive 10 minutes early.
                            </p>
                            <Link
                                href="/dashboard/preseason-week-2"
                                className="inline-flex items-center justify-center rounded-md bg-orange-600 px-4 py-2 font-medium text-sm text-white hover:bg-orange-700"
                            >
                                View Full Week 2 Roster
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {userWeek1Roster && signupStatus && (
                    <Card className="min-w-[280px] flex-1 border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <RiCalendarLine className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                                <CardTitle className="text-lg text-orange-700 dark:text-orange-300">
                                    You're in Week 1 Tryouts this Thursday!
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-orange-700 text-sm dark:text-orange-300">
                                You have been assigned a spot in the Pre-Season
                                Week 1 tryout.
                            </p>
                            <div className="space-y-1.5 rounded-md bg-orange-100 p-3 text-sm dark:bg-orange-900">
                                {getEventsByType(
                                    signupStatus.config,
                                    "tryout"
                                )[0]?.eventDate && (
                                    <div className="flex justify-between">
                                        <span className="text-orange-700 dark:text-orange-300">
                                            Date:
                                        </span>
                                        <span className="font-semibold text-orange-800 dark:text-orange-200">
                                            {formatEventDate(
                                                getEventsByType(
                                                    signupStatus.config,
                                                    "tryout"
                                                )[0]!.eventDate
                                            )}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-orange-700 dark:text-orange-300">
                                        Session:
                                    </span>
                                    <span className="font-semibold text-orange-800 dark:text-orange-200">
                                        {userWeek1Roster.sessionNumber === 3
                                            ? "Alternate"
                                            : `Session ${userWeek1Roster.sessionNumber}`}
                                    </span>
                                </div>
                                {userWeek1Roster.sessionNumber !== 3 && (
                                    <div className="flex justify-between">
                                        <span className="text-orange-700 dark:text-orange-300">
                                            Court:
                                        </span>
                                        <span className="font-semibold text-orange-800 dark:text-orange-200">
                                            Court {userWeek1Roster.courtNumber}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-orange-700 dark:text-orange-300">
                                        Time:
                                    </span>
                                    <span className="font-semibold text-orange-800 dark:text-orange-200">
                                        {(() => {
                                            const t1Events = getEventsByType(
                                                signupStatus.config,
                                                "tryout"
                                            )
                                            const t1Slots =
                                                t1Events[0]?.timeSlots ?? []
                                            return userWeek1Roster.sessionNumber ===
                                                1
                                                ? formatEventTime(
                                                      t1Slots[0]?.startTime ??
                                                          ""
                                                  ) || "TBD"
                                                : formatEventTime(
                                                      t1Slots[1]?.startTime ??
                                                          ""
                                                  ) || "TBD"
                                        })()}
                                    </span>
                                </div>
                            </div>
                            <p className="text-orange-600 text-xs dark:text-orange-400">
                                Please plan to arrive 10 minutes early.
                            </p>
                            <Link
                                href="/dashboard/preseason-week-1"
                                className="inline-flex items-center justify-center rounded-md bg-orange-600 px-4 py-2 font-medium text-sm text-white hover:bg-orange-700"
                            >
                                View Full Week 1 Roster
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {shouldShowWeek1TryoutSheetsCard && (
                    <Card className="min-w-[280px] flex-1 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-blue-700 text-lg dark:text-blue-300">
                                Week 1 Tryout Sheets
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-blue-700 text-sm dark:text-blue-300">
                                Download the latest week 1 tryout sheets PDF for
                                on-court evaluations.
                            </p>
                            <a
                                href="/dashboard/edit-week-1/tryout-sheets"
                                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700"
                            >
                                Download Week 1 PDF
                            </a>
                        </CardContent>
                    </Card>
                )}

                {shouldShowWeek2TryoutSheetsCard && (
                    <Card className="min-w-[280px] flex-1 border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-indigo-700 text-lg dark:text-indigo-300">
                                Week 2 Tryout Sheets
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-indigo-700 text-sm dark:text-indigo-300">
                                Download the latest week 2 tryout sheets PDF by
                                division/session for on-court evaluations.
                            </p>
                            <a
                                href="/dashboard/edit-week-2/tryout-sheets"
                                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 font-medium text-sm text-white hover:bg-indigo-700"
                            >
                                Download Week 2 PDF
                            </a>
                        </CardContent>
                    </Card>
                )}

                {shouldShowWeek3TryoutSheetsCard && (
                    <Card className="min-w-[280px] flex-1 border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-indigo-700 text-lg dark:text-indigo-300">
                                Week 3 Tryout Sheets
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-indigo-700 text-sm dark:text-indigo-300">
                                Download the latest week 3 tryout sheets PDF by
                                division/session for on-court evaluations.
                            </p>
                            <a
                                href="/dashboard/edit-week-3/tryout-sheets"
                                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 font-medium text-sm text-white hover:bg-indigo-700"
                            >
                                Download Week 3 PDF
                            </a>
                        </CardContent>
                    </Card>
                )}

                {shouldShowWeek1NametagCard && (
                    <Card className="min-w-[280px] flex-1">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">
                                Week 1 Nametag Labels
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-muted-foreground text-sm">
                                Download Week 1 sessions 1 and 2 Nametags.
                                Should be printed on{" "}
                                <a
                                    href={site.links.avery5164Labels}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline hover:text-primary/80"
                                >
                                    Avery 5164 labels
                                </a>
                                .
                            </p>
                            <a
                                href="/dashboard/edit-week-1/nametags"
                                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700"
                            >
                                Download Week 1 Nametag PDF
                            </a>
                        </CardContent>
                    </Card>
                )}

                {shouldShowWeek2NametagCard && (
                    <Card className="min-w-[280px] flex-1">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">
                                Week 2 Nametag Labels
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-muted-foreground text-sm">
                                Download Week 2 sessions 1-3 Nametags. Should be
                                printed on{" "}
                                <a
                                    href={site.links.avery5164Labels}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline hover:text-primary/80"
                                >
                                    Avery 5164 labels
                                </a>
                                .
                            </p>
                            <a
                                href="/dashboard/edit-week-2/nametags"
                                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700"
                            >
                                Download Week 2 Nametag PDF
                            </a>
                        </CardContent>
                    </Card>
                )}

                {shouldShowWeek3NametagCard && (
                    <Card className="min-w-[280px] flex-1">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">
                                Week 3 Nametag Labels
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-muted-foreground text-sm">
                                Download Week 3 sessions 1-3 Nametags. Should be
                                printed on{" "}
                                <a
                                    href={site.links.avery5164Labels}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline hover:text-primary/80"
                                >
                                    Avery 5164 labels
                                </a>
                                .
                            </p>
                            <a
                                href="/dashboard/edit-week-3/nametags"
                                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700"
                            >
                                Download Week 3 Nametag PDF
                            </a>
                        </CardContent>
                    </Card>
                )}

                {shouldShowRatePlayersCard && (
                    <Card className="min-w-[280px] flex-1 border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <RiStarLine className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                                <CardTitle className="text-lg text-violet-700 dark:text-violet-300">
                                    Rate Players
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-sm text-violet-700 dark:text-violet-300">
                                Please take time to rate players on the Rate
                                Player page. Your ratings help place playeres in
                                the appropriate groups for the remaining
                                tryouts.
                            </p>
                            <Link
                                href="/dashboard/rate-player"
                                className="inline-flex items-center justify-center rounded-md bg-violet-600 px-4 py-2 font-medium text-sm text-white hover:bg-violet-700"
                            >
                                Rate Players
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {discount && signupStatus && !signupStatus.signup && (
                    <Card className="min-w-[280px] flex-1 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <RiCoupon3Line className="h-5 w-5 text-green-600 dark:text-green-400" />
                                <CardTitle className="text-green-700 text-lg dark:text-green-300">
                                    Discount Available!
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <p className="text-green-700 dark:text-green-300">
                                    You have a{" "}
                                    <span className="font-bold">
                                        {discount.percentage}% discount
                                    </span>{" "}
                                    available for season registration.
                                </p>
                                {discount.expiration && (
                                    <p className="text-green-600 text-sm dark:text-green-400">
                                        Expires on{" "}
                                        {new Date(
                                            discount.expiration
                                        ).toLocaleDateString("en-US")}
                                    </p>
                                )}
                                {isSeasonRegistrationOpen(
                                    signupStatus.config.phase
                                ) && (
                                    <Link
                                        href="/dashboard/pay-season"
                                        className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 font-medium text-sm text-white hover:bg-green-700"
                                    >
                                        Use Discount Now
                                    </Link>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {signupStatus && (
                    <Card className="min-w-[280px] flex-1">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <RiCalendarLine className="h-5 w-5 text-muted-foreground" />
                                <CardTitle className="text-lg">
                                    {seasonLabel} Season
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {signupStatus.config.phase === "off_season" ? (
                                <p className="text-muted-foreground">
                                    Check back soon for the next season!
                                </p>
                            ) : isSeasonRegistrationOpen(
                                  signupStatus.config.phase
                              ) ? (
                                /* Registration phases (through Select Captains):
                                   signup confirmation, waitlist, or signup CTA */
                                signupStatus.signup ? (
                                    <RegistrationConfirmation
                                        signupStatus={signupStatus}
                                    />
                                ) : signupStatus.seasonFull &&
                                  signupStatus.season ? (
                                    <WaitlistContent
                                        signupStatus={signupStatus}
                                        seasonLabel={seasonLabel}
                                        waitlistSeasonId={waitlistSeasonId}
                                        activeWaiver={activeWaiver}
                                    />
                                ) : (
                                    <SignupCTA
                                        signupStatus={signupStatus}
                                        seasonLabel={seasonLabel}
                                    />
                                )
                            ) : signupStatus.config.phase ===
                                  "prep_tryout_week_1" ||
                              signupStatus.config.phase ===
                                  "prep_tryout_week_2" ||
                              signupStatus.config.phase ===
                                  "prep_tryout_week_3" ? (
                                signupStatus.signup ? (
                                    <RegistrationConfirmation
                                        signupStatus={signupStatus}
                                    />
                                ) : signupStatus.season ? (
                                    <div className="space-y-3">
                                        <p className="text-muted-foreground">
                                            Registration is closed. Tryouts are
                                            underway for the {seasonLabel}{" "}
                                            season.
                                        </p>
                                        <WaitlistInterestPanel
                                            signupStatus={signupStatus}
                                            waitlistSeasonId={waitlistSeasonId}
                                            pitch="Interested in joining? There are occasionally drop-outs, injuries, or scheduling conflicts. Express your interest to get on the waitlist."
                                            activeWaiver={activeWaiver}
                                        />
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground">
                                        Registration is closed. Tryouts are
                                        underway for the {seasonLabel} season.
                                    </p>
                                )
                            ) : signupStatus.config.phase === "draft" ? (
                                playerTeamAssignment ? (
                                    <TeamAssignmentDisplay
                                        assignment={playerTeamAssignment}
                                    />
                                ) : (
                                    <div className="space-y-2">
                                        <p className="font-medium text-sm">
                                            Teams are being formed!
                                        </p>
                                        <p className="text-muted-foreground text-sm">
                                            Captains are drafting players onto
                                            teams. Check back soon for your team
                                            assignment.
                                        </p>
                                    </div>
                                )
                            ) : signupStatus.config.phase ===
                              "regular_season" ? (
                                <div className="space-y-3">
                                    <p className="font-medium text-sm">
                                        Regular season is underway!
                                    </p>
                                    <p className="text-muted-foreground text-sm">
                                        Check the schedule and standings for the
                                        latest results.
                                    </p>
                                    {playerTeamAssignment ? (
                                        <TeamAssignmentDisplay
                                            assignment={playerTeamAssignment}
                                        />
                                    ) : (
                                        !signupStatus.signup &&
                                        signupStatus.season && (
                                            <WaitlistInterestPanel
                                                signupStatus={signupStatus}
                                                waitlistSeasonId={
                                                    waitlistSeasonId
                                                }
                                                pitch="Want to play? Drop-outs, injuries, and scheduling conflicts open spots mid-season. Express your interest to join the waitlist or sub list."
                                                activeWaiver={activeWaiver}
                                            />
                                        )
                                    )}
                                </div>
                            ) : signupStatus.config.phase === "playoffs" ? (
                                <div className="space-y-3">
                                    <p className="font-medium text-sm">
                                        Playoffs are underway!
                                    </p>
                                    <p className="text-muted-foreground text-sm">
                                        Check the playoff bracket for matchups
                                        and results.
                                    </p>
                                    {playerTeamAssignment ? (
                                        <TeamAssignmentDisplay
                                            assignment={playerTeamAssignment}
                                        />
                                    ) : (
                                        !signupStatus.signup &&
                                        signupStatus.season && (
                                            <WaitlistInterestPanel
                                                signupStatus={signupStatus}
                                                waitlistSeasonId={
                                                    waitlistSeasonId
                                                }
                                                pitch="Looking ahead to next season? Express your interest now to be on the waitlist for the next signup window or to sub during playoffs if a spot opens."
                                                activeWaiver={activeWaiver}
                                            />
                                        )
                                    )}
                                </div>
                            ) : signupStatus.config.phase === "complete" ? (
                                <div className="space-y-3">
                                    <p className="text-muted-foreground">
                                        The {seasonLabel} season is complete.
                                        Thanks for playing!
                                    </p>
                                    {playerTeamAssignment && (
                                        <TeamAssignmentDisplay
                                            assignment={playerTeamAssignment}
                                        />
                                    )}
                                </div>
                            ) : (
                                <p className="text-muted-foreground">
                                    Season information will be available soon.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            {session?.user && (
                <Suspense>
                    <PreviousSeasonsSection userId={session.user.id} />
                </Suspense>
            )}
        </div>
    )
}
