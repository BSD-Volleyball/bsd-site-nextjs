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
    waitlist
} from "@/database/schema"
import { eq, and, desc, count } from "drizzle-orm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RiCheckLine, RiCalendarLine, RiCoupon3Line } from "@remixicon/react"
import Link from "next/link"
import {
    getSeasonConfig,
    getCurrentSeasonAmount,
    isLatePricing
} from "@/lib/site-config"
import { getActiveDiscountForUser } from "@/lib/discount"
import { WaitlistButton } from "./waitlist-button"
import { PreviousSeasonsCard } from "./previous-seasons-card"

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
            captainPreferredName: users.preffered_name
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .innerJoin(users, eq(teams.captain, users.id))
        .where(eq(drafts.user, userId))
        .orderBy(desc(seasons.year), desc(seasons.id))

    return results.map((r) => ({
        year: r.year,
        season: r.season,
        divisionName: r.divisionName,
        teamName: r.teamName,
        teamId: r.teamId,
        captainName: `${r.captainPreferredName || r.captainFirstName} ${r.captainLastName}`
    }))
}

export default async function DashboardPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    let signupStatus = null
    let userName: string | null = null
    let previousSeasons: PreviousSeason[] = []
    let discount: Awaited<ReturnType<typeof getActiveDiscountForUser>> = null

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
    }

    const seasonLabel = signupStatus
        ? `${signupStatus.config.seasonName.charAt(0).toUpperCase() + signupStatus.config.seasonName.slice(1)} ${signupStatus.config.seasonYear}`
        : null

    const waitlistSeasonId = signupStatus?.season?.id ?? null

    const greeting = userName
        ? `Hi ${userName}, Welcome back 👋`
        : "Hi, Welcome back 👋"

    return (
        <div className="space-y-6">
            <PageHeader
                title={greeting}
                description="Here's what's happening with your account today."
            />

            {discount && signupStatus && !signupStatus.signup && (
                <Card className="max-w-md border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
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
                            {signupStatus.config.registrationOpen && (
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
                <Card className="max-w-md">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <RiCalendarLine className="h-5 w-5 text-muted-foreground" />
                            <CardTitle className="text-lg">
                                {seasonLabel} Season
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {signupStatus.signup ? (
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
                                            Paid $
                                            {signupStatus.signup.amount_paid} on{" "}
                                            {new Date(
                                                signupStatus.signup.created_at
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
                                            {signupStatus.signup.captain ===
                                            "yes"
                                                ? "Yes"
                                                : signupStatus.signup
                                                        .captain ===
                                                    "only_if_needed"
                                                  ? "Only if needed"
                                                  : "No"}
                                        </span>
                                    </div>

                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">
                                            Week 1 Tryouts:
                                        </span>
                                        <span className="font-medium">
                                            {signupStatus.signup.play_1st_week
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

                                    {signupStatus.signup.dates_missing && (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-muted-foreground">
                                                Dates Missing:
                                            </span>
                                            <span className="font-medium text-xs">
                                                {
                                                    signupStatus.signup
                                                        .dates_missing
                                                }
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : signupStatus.config.registrationOpen &&
                          signupStatus.seasonFull &&
                          signupStatus.season ? (
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
                                                    You have been approved from
                                                    the waitlist and can now
                                                    complete your registration.
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
                                                You've expressed interest in
                                                playing. We'll reach out if a
                                                spot opens up!
                                            </p>
                                        </div>
                                    )
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-muted-foreground text-sm">
                                            Express your interest in case a spot
                                            opens up due to a drop or injury.
                                        </p>
                                        <WaitlistButton
                                            seasonId={waitlistSeasonId!}
                                        />
                                    </div>
                                )}
                            </div>
                        ) : signupStatus.config.registrationOpen ? (
                            <div className="space-y-3">
                                <p className="text-muted-foreground">
                                    You haven't signed up for the {seasonLabel}{" "}
                                    season yet.
                                </p>
                                <div className="space-y-1 rounded-lg bg-muted p-3">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            Season Fee:
                                        </span>
                                        <span className="font-semibold">
                                            $
                                            {getCurrentSeasonAmount(
                                                signupStatus.config
                                            )}
                                        </span>
                                    </div>
                                    {signupStatus.config.lateDate &&
                                        signupStatus.config.lateAmount &&
                                        (isLatePricing(signupStatus.config) ? (
                                            <p className="text-amber-600 text-xs dark:text-amber-400">
                                                Late registration pricing in
                                                effect
                                            </p>
                                        ) : (
                                            <p className="text-muted-foreground text-xs">
                                                Price increases to $
                                                {signupStatus.config.lateAmount}{" "}
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
                        ) : (
                            <p className="text-muted-foreground">
                                Registration for the {seasonLabel} season is
                                currently closed.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            {previousSeasons.length > 0 && (
                <PreviousSeasonsCard previousSeasons={previousSeasons} />
            )}
        </div>
    )
}
