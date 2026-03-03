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
    week1Rosters,
    week2Rosters
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
import { PHASE_CONFIG } from "@/lib/season-phases"
import { getActiveDiscountForUser } from "@/lib/discount"
import { WaitlistButton } from "./waitlist-button"
import { PreviousSeasonsCard } from "./previous-seasons-card"
import {
    hasCaptainPagesAccessBySession,
    isAdminOrDirectorBySession,
    isCommissionerForSeason
} from "@/lib/rbac"
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
            captainPreferredName: users.preffered_name,
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
    const hasTryoutSheetAccess = session?.user
        ? await hasCaptainPagesAccessBySession()
        : false
    const isAdmin = session?.user ? await isAdminOrDirectorBySession() : false
    let isCurrentSeasonCommissioner = false

    let signupStatus = null
    let userName: string | null = null
    let previousSeasons: PreviousSeason[] = []
    let evalStats: { totalNew: number; ratedByUser: number } | null = null
    let discount: Awaited<ReturnType<typeof getActiveDiscountForUser>> = null
    let commissionerCaptainStatuses: CaptainSelectionDivisionStatus[] = []
    let adminCaptainStatuses: CaptainSelectionDivisionStatus[] = []
    let hasWeek1RosterData = false
    let hasWeek2RosterData = false
    let userWeek1Roster: { sessionNumber: number; courtNumber: number } | null = null

    if (session?.user) {
        signupStatus = await getSeasonSignup(session.user.id)
        previousSeasons = await getPreviousSeasonsPlayed(session.user.id)
        discount = await getActiveDiscountForUser(session.user.id)

        // Get user's preferred name or first name for greeting
        const [user] = await db
            .select({
                preffered_name: users.preffered_name,
                first_name: users.first_name
            })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1)

        userName = user?.preffered_name || user?.first_name || null

        if (isAdmin && signupStatus?.config.seasonId) {
            evalStats = await getNewPlayerEvalStats(
                session.user.id,
                signupStatus.config.seasonId
            )
        }

        if (signupStatus?.config.seasonId) {
            isCurrentSeasonCommissioner = await isCommissionerForSeason(
                session.user.id,
                signupStatus.config.seasonId
            )

            const [week1RosterRow] = await db
                .select({ id: week1Rosters.id })
                .from(week1Rosters)
                .where(eq(week1Rosters.season, signupStatus.config.seasonId))
                .limit(1)
            hasWeek1RosterData = !!week1RosterRow

            if (signupStatus.config.phase === "prep_tryout_week_1") {
                const [myWeek1Slot] = await db
                    .select({
                        sessionNumber: week1Rosters.session_number,
                        courtNumber: week1Rosters.court_number
                    })
                    .from(week1Rosters)
                    .where(
                        and(
                            eq(week1Rosters.season, signupStatus.config.seasonId),
                            eq(week1Rosters.user, session.user.id)
                        )
                    )
                    .limit(1)
                userWeek1Roster = myWeek1Slot ?? null
            }

            const [week2RosterRow] = await db
                .select({ id: week2Rosters.id })
                .from(week2Rosters)
                .where(eq(week2Rosters.season, signupStatus.config.seasonId))
                .limit(1)
            hasWeek2RosterData = !!week2RosterRow

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

                {userWeek1Roster && signupStatus && (
                    <Card className="min-w-[280px] flex-1 border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <RiCalendarLine className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                                <CardTitle className="text-lg text-orange-700 dark:text-orange-300">
                                    You're in Week 1 Tryouts!
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-orange-700 text-sm dark:text-orange-300">
                                You have been assigned a spot in the Pre-Season Week 1 tryout.
                            </p>
                            <div className="rounded-md bg-orange-100 p-3 dark:bg-orange-900 space-y-1.5 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-orange-700 dark:text-orange-300">Session:</span>
                                    <span className="font-semibold text-orange-800 dark:text-orange-200">
                                        {userWeek1Roster.sessionNumber === 3
                                            ? "Alternate"
                                            : `Session ${userWeek1Roster.sessionNumber}`}
                                    </span>
                                </div>
                                {userWeek1Roster.sessionNumber !== 3 && (
                                    <div className="flex justify-between">
                                        <span className="text-orange-700 dark:text-orange-300">Court:</span>
                                        <span className="font-semibold text-orange-800 dark:text-orange-200">
                                            Court {userWeek1Roster.courtNumber}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-orange-700 dark:text-orange-300">Time:</span>
                                    <span className="font-semibold text-orange-800 dark:text-orange-200">
                                        {userWeek1Roster.sessionNumber === 1
                                            ? signupStatus.config.tryout1Session1Time || "TBD"
                                            : signupStatus.config.tryout1Session2Time || "TBD"}
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
                                    <div className="space-y-4">
                                        <RegistrationConfirmation
                                            signupStatus={signupStatus}
                                        />
                                        <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950">
                                            <p className="font-medium text-blue-700 text-sm dark:text-blue-300">
                                                {
                                                    PHASE_CONFIG[
                                                        signupStatus.config
                                                            .phase
                                                    ].description
                                                }
                                            </p>
                                        </div>
                                    </div>
                                ) : signupStatus.season ? (
                                    <div className="space-y-3">
                                        <p className="text-muted-foreground">
                                            Registration is closed. Tryouts are
                                            underway for the {seasonLabel}{" "}
                                            season.
                                        </p>
                                        {signupStatus.onWaitlist ? (
                                            signupStatus.waitlistApproved ? (
                                                <div className="flex items-center gap-3">
                                                    <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
                                                        <RiCheckLine className="h-5 w-5 text-green-600 dark:text-green-400" />
                                                    </div>
                                                    <p className="font-medium text-green-700 text-sm dark:text-green-400">
                                                        You've been approved
                                                        from the waitlist! We'll
                                                        be in touch with next
                                                        steps.
                                                    </p>
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
                                <div className="space-y-2">
                                    <p className="font-medium text-sm">
                                        Teams are being formed!
                                    </p>
                                    <p className="text-muted-foreground text-sm">
                                        Commissioners are drafting players onto
                                        teams. Check back soon for your team
                                        assignment.
                                    </p>
                                </div>
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
                                </div>
                            ) : signupStatus.config.phase === "complete" ? (
                                <p className="text-muted-foreground">
                                    The {seasonLabel} season is complete. Thanks
                                    for playing!
                                </p>
                            ) : (
                                <p className="text-muted-foreground">
                                    Season information will be available soon.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            {previousSeasons.length > 0 && (
                <PreviousSeasonsCard previousSeasons={previousSeasons} />
            )}
        </div>
    )
}
