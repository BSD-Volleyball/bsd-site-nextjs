import { Suspense } from "react"
import { PageHeader } from "@/components/layout/page-header"
import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    seasons,
    signups,
    users,
    drafts,
    teams,
    divisions,
    individual_divisions,
    waitlist,
    champions,
    evaluations,
    commissioners,
    concerns,
    week1Rosters,
    week2Rosters,
    week3Rosters
} from "@/database/schema"
import { eq, and, desc, count, inArray, isNotNull } from "drizzle-orm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    RiCheckLine,
    RiCalendarLine,
    RiCoupon3Line,
    RiStarLine
} from "@remixicon/react"
import Link from "next/link"
import {
    getSeasonConfig,
    getCurrentSeasonAmount,
    isLatePricing
} from "@/lib/site-config"
import { getActiveDiscountForUser } from "@/lib/discount"
import { WaitlistButton } from "./waitlist-button"
import { PreviousSeasonsCard } from "./previous-seasons-card"
import { WelcomeTeamCard } from "./captain-info-card"
import {
    hasCaptainPagesAccessBySession,
    hasPermissionBySession,
    isAdminOrDirectorBySession,
    isCommissionerForSeason
} from "@/lib/rbac"
import {
    getCaptainWelcomeData,
    getPlayerTeamAssignment,
    getNextMatch,
    type CaptainWelcomeData,
    type PlayerTeamAssignment,
    type NextMatch
} from "./actions"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
    title: "Dashboard"
}

async function getSeasonSignup(userId: string) {
    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return {
            season: null,
            signup: null,
            pairPickName: null,
            config,
            seasonFull: false,
            onWaitlist: false,
            waitlistApproved: false
        }
    }

    const season = { id: config.seasonId }

    // Check if user has a signup for this season
    const [signup] = await db
        .select()
        .from(signups)
        .where(and(eq(signups.season, season.id), eq(signups.player, userId)))
        .limit(1)

    // If there's a pair pick, get their name
    let pairPickName: string | null = null
    if (signup?.pair_pick) {
        const [pairUser] = await db
            .select({
                first_name: users.first_name,
                last_name: users.last_name
            })
            .from(users)
            .where(eq(users.id, signup.pair_pick))
            .limit(1)

        if (pairUser) {
            pairPickName =
                [pairUser.first_name, pairUser.last_name]
                    .filter(Boolean)
                    .join(" ") || null
        }
    }

    // Check if season is full
    let seasonFull = false
    const maxPlayers = parseInt(config.maxPlayers, 10)
    if (maxPlayers > 0 && !signup) {
        const [result] = await db
            .select({ total: count() })
            .from(signups)
            .where(eq(signups.season, season.id))

        if (result && result.total >= maxPlayers) {
            seasonFull = true
        }
    }

    // Check if user is on the waitlist
    let onWaitlist = false
    let waitlistApproved = false
    if (!signup) {
        const [waitlistEntry] = await db
            .select({ id: waitlist.id, approved: waitlist.approved })
            .from(waitlist)
            .where(
                and(eq(waitlist.season, season.id), eq(waitlist.user, userId))
            )
            .limit(1)

        onWaitlist = !!waitlistEntry
        waitlistApproved = waitlistEntry?.approved ?? false
    }

    return {
        season,
        signup,
        pairPickName,
        config,
        seasonFull,
        onWaitlist,
        waitlistApproved
    }
}

export interface PreviousSeason {
    year: number
    season: string
    divisionName: string
    teamName: string
    captainName: string
    teamId: number
    champion: boolean
    championPicture: string | null
}

async function getPreviousSeasonsPlayed(
    userId: string
): Promise<PreviousSeason[]> {
    const results = await db
        .select({
            year: seasons.year,
            season: seasons.season,
            divisionName: divisions.name,
            teamName: teams.name,
            teamId: teams.id,
            captainFirstName: users.first_name,
            captainLastName: users.last_name,
            captainPreferredName: users.preferred_name,
            championId: champions.id,
            championPicture: champions.picture
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .innerJoin(users, eq(teams.captain, users.id))
        .leftJoin(champions, eq(teams.id, champions.team))
        .where(eq(drafts.user, userId))
        .orderBy(desc(seasons.year), desc(seasons.id))

    return results.map((r) => ({
        year: r.year,
        season: r.season,
        divisionName: r.divisionName,
        teamName: r.teamName,
        teamId: r.teamId,
        captainName: `${r.captainPreferredName || r.captainFirstName} ${r.captainLastName}`,
        champion: !!r.championId,
        championPicture: r.championPicture
    }))
}

async function PreviousSeasonsSection({ userId }: { userId: string }) {
    const previousSeasons = await getPreviousSeasonsPlayed(userId)
    if (previousSeasons.length === 0) return null
    return <PreviousSeasonsCard previousSeasons={previousSeasons} />
}

async function getNewPlayerEvalStats(
    userId: string,
    seasonId: number
): Promise<{ totalNew: number; ratedByUser: number }> {
    // Get all signed-up players for this season
    const signedUpUsers = await db
        .select({ userId: signups.player })
        .from(signups)
        .where(eq(signups.season, seasonId))

    const userIds = signedUpUsers.map((r) => r.userId)
    if (userIds.length === 0) return { totalNew: 0, ratedByUser: 0 }

    // Find which have been drafted before (not new)
    const draftedUsers = await db
        .select({ user: drafts.user })
        .from(drafts)
        .where(inArray(drafts.user, userIds))

    const draftedUserIds = new Set(draftedUsers.map((d) => d.user))
    const newPlayerIds = userIds.filter((id) => !draftedUserIds.has(id))
    const totalNew = newPlayerIds.length

    if (totalNew === 0) return { totalNew: 0, ratedByUser: 0 }

    // Count how many the current user has evaluated this season
    const [result] = await db
        .select({ total: count() })
        .from(evaluations)
        .where(
            and(
                eq(evaluations.season, seasonId),
                eq(evaluations.evaluator, userId),
                inArray(evaluations.player, newPlayerIds)
            )
        )

    return { totalNew, ratedByUser: result?.total ?? 0 }
}

interface CaptainSelectionDivisionStatus {
    divisionId: number
    divisionName: string
    requiredTeams: number
    teamsWithCaptain: number
    isComplete: boolean
}

async function getAllDivisionCaptainSelectionStatus(
    seasonId: number
): Promise<CaptainSelectionDivisionStatus[]> {
    const divisionTargets = await db
        .select({
            divisionId: individual_divisions.division,
            divisionName: divisions.name,
            requiredTeams: individual_divisions.teams
        })
        .from(individual_divisions)
        .innerJoin(divisions, eq(individual_divisions.division, divisions.id))
        .where(eq(individual_divisions.season, seasonId))
        .orderBy(divisions.level)

    if (divisionTargets.length === 0) return []

    const captainCounts = await db
        .select({
            divisionId: teams.division,
            total: count()
        })
        .from(teams)
        .where(
            and(
                eq(teams.season, seasonId),
                inArray(
                    teams.division,
                    divisionTargets.map((d) => d.divisionId)
                ),
                isNotNull(teams.captain)
            )
        )
        .groupBy(teams.division)

    const countByDivisionId = new Map(
        captainCounts.map((row) => [row.divisionId, row.total])
    )

    return divisionTargets.map((division) => {
        const teamsWithCaptain = countByDivisionId.get(division.divisionId) ?? 0
        return {
            divisionId: division.divisionId,
            divisionName: division.divisionName,
            requiredTeams: division.requiredTeams,
            teamsWithCaptain,
            isComplete:
                division.requiredTeams > 0 &&
                teamsWithCaptain === division.requiredTeams
        }
    })
}

async function getCommissionerCaptainSelectionStatus(
    userId: string,
    seasonId: number
): Promise<CaptainSelectionDivisionStatus[]> {
    const commissionerDivisions = await db
        .select({
            divisionId: commissioners.division,
            divisionName: divisions.name,
            requiredTeams: individual_divisions.teams
        })
        .from(commissioners)
        .innerJoin(divisions, eq(commissioners.division, divisions.id))
        .leftJoin(
            individual_divisions,
            and(
                eq(individual_divisions.season, seasonId),
                eq(individual_divisions.division, commissioners.division)
            )
        )
        .where(
            and(
                eq(commissioners.season, seasonId),
                eq(commissioners.commissioner, userId)
            )
        )
        .orderBy(divisions.level)

    if (commissionerDivisions.length === 0) return []

    const captainCounts = await db
        .select({
            divisionId: teams.division,
            total: count()
        })
        .from(teams)
        .where(
            and(
                eq(teams.season, seasonId),
                inArray(
                    teams.division,
                    commissionerDivisions.map((d) => d.divisionId)
                ),
                isNotNull(teams.captain)
            )
        )
        .groupBy(teams.division)

    const countByDivisionId = new Map(
        captainCounts.map((row) => [row.divisionId, row.total])
    )

    return commissionerDivisions.map((division) => {
        const requiredTeams = division.requiredTeams ?? 0
        const teamsWithCaptain = countByDivisionId.get(division.divisionId) ?? 0
        return {
            divisionId: division.divisionId,
            divisionName: division.divisionName,
            requiredTeams,
            teamsWithCaptain,
            isComplete: requiredTeams > 0 && teamsWithCaptain === requiredTeams
        }
    })
}

function TeamAssignmentDisplay({
    assignment
}: {
    assignment: PlayerTeamAssignment
}) {
    return (
        <div className="space-y-3">
            <div>
                <p className="font-semibold text-sm">{assignment.teamName}</p>
                <p className="pl-5 text-muted-foreground text-sm">
                    {assignment.divisionName} Division
                </p>
            </div>
            <div>
                <p className="mb-0.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                    Captain
                </p>
                <p className="pl-5 text-sm">
                    {assignment.captainName}{" "}
                    {assignment.captainEmail && (
                        <a
                            href={`mailto:${assignment.captainEmail}`}
                            className="text-primary hover:underline"
                        >
                            {assignment.captainEmail}
                        </a>
                    )}
                </p>
            </div>
            <div>
                <p className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                    Team Roster
                </p>
                <ul className="space-y-0.5">
                    {assignment.roster.map((player) => (
                        <li
                            key={`${player.displayName}-${player.lastName}`}
                            className="flex items-center gap-1.5 text-sm"
                        >
                            {player.isCaptain && (
                                <RiStarLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span
                                className={
                                    player.isCaptain ? "font-medium" : "pl-5"
                                }
                            >
                                {player.displayName} {player.lastName}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}

function RegistrationConfirmation({
    signupStatus
}: {
    signupStatus: NonNullable<Awaited<ReturnType<typeof getSeasonSignup>>>
}) {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
                    <RiCheckLine className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                    <p className="font-medium text-green-700 dark:text-green-400">
                        You're registered!
                    </p>
                    <p className="text-muted-foreground text-sm">
                        Paid ${signupStatus.signup!.amount_paid} on{" "}
                        {new Date(
                            signupStatus.signup!.created_at
                        ).toLocaleDateString()}
                    </p>
                </div>
            </div>

            <div className="space-y-2 border-t pt-4 text-sm">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">
                        Captain Interest:
                    </span>
                    <span className="font-medium capitalize">
                        {signupStatus.signup!.captain === "yes"
                            ? "Yes"
                            : signupStatus.signup!.captain === "only_if_needed"
                              ? "Only if needed"
                              : "No"}
                    </span>
                </div>

                <div className="flex justify-between">
                    <span className="text-muted-foreground">
                        Week 1 Tryouts:
                    </span>
                    <span className="font-medium">
                        {signupStatus.signup!.play_1st_week
                            ? "Requested"
                            : "Not requested"}
                    </span>
                </div>

                {signupStatus.pairPickName && (
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">
                            Pair Request:
                        </span>
                        <span className="font-medium">
                            {signupStatus.pairPickName}
                        </span>
                    </div>
                )}

                {signupStatus.signup!.dates_missing && (
                    <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground">
                            Dates Missing:
                        </span>
                        <span className="font-medium text-xs">
                            {signupStatus.signup!.dates_missing}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

function WaitlistContent({
    signupStatus,
    seasonLabel,
    waitlistSeasonId
}: {
    signupStatus: NonNullable<Awaited<ReturnType<typeof getSeasonSignup>>>
    seasonLabel: string | null
    waitlistSeasonId: number | null
}) {
    return (
        <div className="space-y-3">
            <p className="text-muted-foreground">
                The {seasonLabel} season is currently full.
            </p>
            {signupStatus.onWaitlist ? (
                signupStatus.waitlistApproved ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
                                <RiCheckLine className="h-5 w-5 text-green-600 dark:text-green-400" />
                            </div>
                            <p className="font-medium text-green-700 text-sm dark:text-green-400">
                                You have been approved from the waitlist and can
                                now complete your registration.
                            </p>
                        </div>
                        <Link
                            href="/dashboard/pay-season"
                            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
                        >
                            Sign-up Now
                        </Link>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900">
                            <RiCheckLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <p className="font-medium text-blue-700 text-sm dark:text-blue-400">
                            You've expressed interest in playing. We'll reach
                            out if a spot opens up!
                        </p>
                    </div>
                )
            ) : (
                <div className="space-y-2">
                    <p className="text-muted-foreground text-sm">
                        There are occasionally drop-outs, injuries, or
                        scheduling conflicts. Click here to express your
                        interest in a spot in the league if one opens up or
                        possibly a substitute if needed.
                    </p>
                    <WaitlistButton seasonId={waitlistSeasonId!} />
                </div>
            )}
        </div>
    )
}

function SignupCTA({
    signupStatus,
    seasonLabel
}: {
    signupStatus: NonNullable<Awaited<ReturnType<typeof getSeasonSignup>>>
    seasonLabel: string | null
}) {
    return (
        <div className="space-y-3">
            <p className="text-muted-foreground">
                You haven't signed up for the {seasonLabel} season yet.
            </p>
            <div className="space-y-1 rounded-lg bg-muted p-3">
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Season Fee:</span>
                    <span className="font-semibold">
                        ${getCurrentSeasonAmount(signupStatus.config)}
                    </span>
                </div>
                {signupStatus.config.lateDate &&
                    signupStatus.config.lateAmount &&
                    (isLatePricing(signupStatus.config) ? (
                        <p className="text-amber-600 text-xs dark:text-amber-400">
                            Late registration pricing in effect
                        </p>
                    ) : (
                        <p className="text-muted-foreground text-xs">
                            Price increases to ${signupStatus.config.lateAmount}{" "}
                            after{" "}
                            {new Date(
                                signupStatus.config.lateDate
                            ).toLocaleDateString()}
                        </p>
                    ))}
            </div>
            <div className="flex gap-2">
                <Link
                    href="/dashboard/pay-season"
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
                >
                    Sign-up Now
                </Link>
                <Link
                    href="/spring-2026-season-info"
                    className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 font-medium text-sm hover:bg-accent hover:text-accent-foreground"
                >
                    More Info
                </Link>
            </div>
        </div>
    )
}

export default async function DashboardPage() {
    const session = await auth.api.getSession({ headers: await headers() })
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
    let isDivisionDrafted = false
    let captainWelcomeData: CaptainWelcomeData | null = null
    let playerTeamAssignment: PlayerTeamAssignment | null = null
    let nextMatch: NextMatch | null = null
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
    let assignedActiveConcernsCount = 0

    if (session?.user) {
        const [signupResult, discountResult, userResult] = await Promise.all([
            getSeasonSignup(session.user.id),
            getActiveDiscountForUser(session.user.id),
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
                ["prep_tryout_week_3", "draft"].includes(
                    signupStatus.config.phase
                )
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

                if (isSeasonCaptain && captainTeamEntry) {
                    const [draftRecord] = await db
                        .select({ id: drafts.id })
                        .from(drafts)
                        .innerJoin(teams, eq(drafts.team, teams.id))
                        .where(
                            and(
                                eq(teams.season, signupStatus.config.seasonId),
                                eq(teams.division, captainTeamEntry.divisionId)
                            )
                        )
                        .limit(1)
                    isDivisionDrafted = !!draftRecord
                }

                if (isSeasonCaptain && isDivisionDrafted) {
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

                    const sessionTimes = [
                        signupStatus.config.tryout2Session1Time,
                        signupStatus.config.tryout2Session2Time,
                        signupStatus.config.tryout2Session3Time
                    ]
                    const matchupIndex = Math.floor(
                        (myWeek2Slot.teamNumber - 1) / 2
                    )
                    const sessionTime = sessionTimes[matchupIndex] || "TBD"

                    const captainName = captainRow
                        ? captainRow.preferredName
                            ? `${captainRow.preferredName} ${captainRow.lastName}`
                            : `${captainRow.firstName} ${captainRow.lastName}`
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

                    const sessionTimes = [
                        signupStatus.config.tryout3Session1Time,
                        signupStatus.config.tryout3Session2Time,
                        signupStatus.config.tryout3Session3Time
                    ]
                    const matchupIndex = Math.floor(
                        (myWeek3Slot.teamNumber - 1) / 2
                    )
                    const sessionTime = sessionTimes[matchupIndex] || "TBD"

                    const captainName = captainRow
                        ? captainRow.preferredName
                            ? `${captainRow.preferredName} ${captainRow.lastName}`
                            : `${captainRow.firstName} ${captainRow.lastName}`
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
        isSeasonCaptain &&
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
                {nextMatch && (
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
                                        {nextMatch.date}
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
                            </div>
                            <Link
                                href="/dashboard/season-schedule"
                                className="block text-center text-blue-700 text-sm underline underline-offset-4 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-200"
                            >
                                View Full Schedule →
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
                                {signupStatus.config.tryout3Date && (
                                    <div className="flex justify-between">
                                        <span className="text-orange-700 dark:text-orange-300">
                                            Date:
                                        </span>
                                        <span className="font-semibold text-orange-800 dark:text-orange-200">
                                            {signupStatus.config.tryout3Date}
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
                                {signupStatus.config.tryout2Date && (
                                    <div className="flex justify-between">
                                        <span className="text-orange-700 dark:text-orange-300">
                                            Date:
                                        </span>
                                        <span className="font-semibold text-orange-800 dark:text-orange-200">
                                            {signupStatus.config.tryout2Date}
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
                                {signupStatus.config.tryout1Date && (
                                    <div className="flex justify-between">
                                        <span className="text-orange-700 dark:text-orange-300">
                                            Date:
                                        </span>
                                        <span className="font-semibold text-orange-800 dark:text-orange-200">
                                            {signupStatus.config.tryout1Date}
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
                                        {userWeek1Roster.sessionNumber === 1
                                            ? signupStatus.config
                                                  .tryout1Session1Time || "TBD"
                                            : signupStatus.config
                                                  .tryout1Session2Time || "TBD"}
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
                                    href="https://www.amazon.com/dp/B0BCFNZJK6"
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
                                    href="https://www.amazon.com/dp/B0BCFNZJK6"
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
                                    href="https://www.amazon.com/dp/B0BCFNZJK6"
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
                                        ).toLocaleDateString()}
                                    </p>
                                )}
                                {signupStatus.config.phase ===
                                    "registration_open" && (
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
                            ) : signupStatus.config.phase ===
                              "registration_open" ? (
                                /* Registration phase: signup confirmation, waitlist, or signup CTA */
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
                                    />
                                ) : (
                                    <SignupCTA
                                        signupStatus={signupStatus}
                                        seasonLabel={seasonLabel}
                                    />
                                )
                            ) : signupStatus.config.phase ===
                                  "select_commissioners" ||
                              signupStatus.config.phase === "select_captains" ||
                              signupStatus.config.phase ===
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
                                        {signupStatus.onWaitlist ? (
                                            signupStatus.waitlistApproved ? (
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
                                                            <RiCheckLine className="h-5 w-5 text-green-600 dark:text-green-400" />
                                                        </div>
                                                        <p className="font-medium text-green-700 text-sm dark:text-green-400">
                                                            You've been approved
                                                            from the waitlist!
                                                            Please sign up for
                                                            the season now.
                                                        </p>
                                                    </div>
                                                    <Link
                                                        href="/dashboard/pay-season"
                                                        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
                                                    >
                                                        Sign-up Now
                                                    </Link>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3">
                                                    <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900">
                                                        <RiCheckLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                                    </div>
                                                    <p className="font-medium text-blue-700 text-sm dark:text-blue-400">
                                                        You've expressed
                                                        interest in playing.
                                                        We'll reach out if a
                                                        spot opens up!
                                                    </p>
                                                </div>
                                            )
                                        ) : (
                                            <div className="space-y-2">
                                                <p className="text-muted-foreground text-sm">
                                                    Interested in joining? There
                                                    are occasionally drop-outs,
                                                    injuries, or scheduling
                                                    conflicts. Express your
                                                    interest to get on the
                                                    waitlist.
                                                </p>
                                                <WaitlistButton
                                                    seasonId={waitlistSeasonId!}
                                                />
                                            </div>
                                        )}
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
                                    {playerTeamAssignment && (
                                        <TeamAssignmentDisplay
                                            assignment={playerTeamAssignment}
                                        />
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
                                    {playerTeamAssignment && (
                                        <TeamAssignmentDisplay
                                            assignment={playerTeamAssignment}
                                        />
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
