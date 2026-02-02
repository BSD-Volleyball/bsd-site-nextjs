import { PageHeader } from "@/components/layout/page-header"
import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { seasons, signups, users, drafts, teams, divisions } from "@/database/schema"
import { eq, and, desc } from "drizzle-orm"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { RiCheckLine, RiCalendarLine, RiHistoryLine } from "@remixicon/react"
import Link from "next/link"
import { getSeasonConfig } from "@/lib/site-config"

export const metadata: Metadata = {
    title: "Dashboard"
}

async function getSeasonSignup(userId: string) {
    const config = await getSeasonConfig()

    // Look up the season
    const [season] = await db
        .select({ id: seasons.id, code: seasons.code })
        .from(seasons)
        .where(and(eq(seasons.year, config.seasonYear), eq(seasons.season, config.seasonName)))
        .limit(1)

    if (!season) {
        return { season: null, signup: null, pairPickName: null, config }
    }

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
            pairPickName = [pairUser.first_name, pairUser.last_name].filter(Boolean).join(" ") || null
        }
    }

    return { season, signup, pairPickName, config }
}

interface PreviousSeason {
    year: number
    season: string
    divisionName: string
    teamName: string
    captainName: string
}

async function getPreviousSeasonsPlayed(userId: string): Promise<PreviousSeason[]> {
    const results = await db
        .select({
            year: seasons.year,
            season: seasons.season,
            divisionName: divisions.name,
            teamName: teams.name,
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

    return results.map(r => ({
        year: r.year,
        season: r.season,
        divisionName: r.divisionName,
        teamName: r.teamName,
        captainName: r.captainPreferredName
            ? `${r.captainFirstName} (${r.captainPreferredName}) ${r.captainLastName}`
            : `${r.captainFirstName} ${r.captainLastName}`
    }))
}

export default async function DashboardPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    let signupStatus = null
    let userName: string | null = null
    let previousSeasons: PreviousSeason[] = []

    if (session?.user) {
        signupStatus = await getSeasonSignup(session.user.id)
        previousSeasons = await getPreviousSeasonsPlayed(session.user.id)

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

    const greeting = userName ? `Hi ${userName}, Welcome back 👋` : "Hi, Welcome back 👋"

    return (
        <div className="space-y-6">
            <PageHeader
                title={greeting}
                description="Here's what's happening with your account today."
            />

            {signupStatus && (
                <Card className="max-w-md">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <RiCalendarLine className="h-5 w-5 text-muted-foreground" />
                            <CardTitle className="text-lg">{seasonLabel} Season</CardTitle>
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
                                            Paid ${signupStatus.signup.amount_paid} on{" "}
                                            {new Date(signupStatus.signup.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>

                                <div className="border-t pt-4 space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Captain Interest:</span>
                                        <span className="font-medium capitalize">
                                            {signupStatus.signup.captain === "yes"
                                                ? "Yes"
                                                : signupStatus.signup.captain === "only_if_needed"
                                                  ? "Only if needed"
                                                  : "No"}
                                        </span>
                                    </div>

                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Week 1 Tryouts:</span>
                                        <span className="font-medium">
                                            {signupStatus.signup.play_1st_week ? "Requested" : "Not requested"}
                                        </span>
                                    </div>

                                    {signupStatus.pairPickName && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Pair Request:</span>
                                            <span className="font-medium">{signupStatus.pairPickName}</span>
                                        </div>
                                    )}

                                    {signupStatus.signup.dates_missing && (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-muted-foreground">Dates Missing:</span>
                                            <span className="font-medium text-xs">
                                                {signupStatus.signup.dates_missing}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : signupStatus.config.registrationOpen ? (
                            <div className="space-y-3">
                                <p className="text-muted-foreground">
                                    You haven't signed up for the {seasonLabel} season yet.
                                </p>
                                <div className="flex gap-2">
                                    <Link
                                        href="/dashboard/pay-season"
                                        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                                    >
                                        Sign-up Now
                                    </Link>
                                    <Link
                                        href="/spring-2026-season-info"
                                        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                                    >
                                        More Info
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <p className="text-muted-foreground">
                                Registration for the {seasonLabel} season is currently closed.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            {previousSeasons.length > 0 && (
                <Card className="max-w-2xl">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <RiHistoryLine className="h-5 w-5 text-muted-foreground" />
                            <CardTitle className="text-lg">Previous Seasons Played</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Season</th>
                                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Division</th>
                                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Team</th>
                                        <th className="text-left py-2 font-medium text-muted-foreground">Captain</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previousSeasons.map((ps, idx) => (
                                        <tr key={idx} className="border-b last:border-0">
                                            <td className="py-2 pr-4">
                                                {ps.season.charAt(0).toUpperCase() + ps.season.slice(1)} {ps.year}
                                            </td>
                                            <td className="py-2 pr-4">{ps.divisionName}</td>
                                            <td className="py-2 pr-4">{ps.teamName}</td>
                                            <td className="py-2">{ps.captainName}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
