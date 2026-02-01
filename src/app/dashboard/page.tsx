import { PageHeader } from "@/components/layout/page-header"
import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { seasons, signups } from "@/database/schema"
import { eq, and } from "drizzle-orm"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { RiCheckLine, RiCalendarLine } from "@remixicon/react"
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
        return { season: null, signup: null, config }
    }

    // Check if user has a signup for this season
    const [signup] = await db
        .select()
        .from(signups)
        .where(and(eq(signups.season, season.id), eq(signups.player, userId)))
        .limit(1)

    return { season, signup, config }
}

export default async function DashboardPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    let signupStatus = null
    if (session?.user) {
        signupStatus = await getSeasonSignup(session.user.id)
    }

    const seasonLabel = signupStatus
        ? `${signupStatus.config.seasonName.charAt(0).toUpperCase() + signupStatus.config.seasonName.slice(1)} ${signupStatus.config.seasonYear}`
        : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Hi, Welcome back 👋"
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
                        ) : signupStatus.config.registrationOpen ? (
                            <div className="space-y-3">
                                <p className="text-muted-foreground">
                                    You haven't signed up for the {seasonLabel} season yet.
                                </p>
                                <Link
                                    href="/dashboard/pay-season"
                                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                                >
                                    Sign-up Now
                                </Link>
                            </div>
                        ) : (
                            <p className="text-muted-foreground">
                                Registration for the {seasonLabel} season is currently closed.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
