import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { tournamentWaitlist } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import { getActiveWaiver } from "@/lib/waivers"
import {
    getTournamentConfig,
    isUserOnTournamentRoster
} from "@/lib/tournament-config"
import { TournamentWaitlistButton } from "@/components/dashboard/tournament-waitlist-button"

export const metadata: Metadata = {
    title: "Tournament Waitlist"
}

export default async function TournamentWaitlistPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect("/auth/sign-in")

    const config = await getTournamentConfig()
    if (!config || config.phase !== "registration_open") {
        redirect("/dashboard")
    }
    if (await isUserOnTournamentRoster(config.tournamentId, session.user.id)) {
        redirect("/dashboard/tournament-team")
    }

    const waiver = await getActiveWaiver()
    if (!waiver) {
        return (
            <p className="text-muted-foreground">
                No active waiver — please contact an administrator.
            </p>
        )
    }

    const [existing] = await db
        .select({ id: tournamentWaitlist.id })
        .from(tournamentWaitlist)
        .where(
            and(
                eq(tournamentWaitlist.tournament_id, config.tournamentId),
                eq(tournamentWaitlist.user_id, session.user.id)
            )
        )
        .limit(1)
    const alreadyOnList = !!existing

    return (
        <div className="space-y-6">
            <PageHeader
                title="Tournament Waitlist"
                description={`Pre-register for ${config.name} — works two ways below.`}
            />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Why use this?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <p>
                        <strong>If you don't have a team yet:</strong> join the
                        list so captains can pick you up when they're filling
                        rosters. They'll see your name and gender when they go
                        to add players.
                    </p>
                    <p>
                        <strong>If you know a captain plans to add you:</strong>{" "}
                        pre-accept the waiver here. That way, when you're added
                        to their roster, you're already cleared to play — no
                        waiver pop-up to deal with on tournament day.
                    </p>
                </CardContent>
            </Card>

            {alreadyOnList ? (
                <Card className="border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950">
                    <CardContent className="pt-6 text-sm">
                        You're already on the list for{" "}
                        <strong>{config.name}</strong>. The waiver is accepted;
                        we'll show your status on the dashboard once a captain
                        picks you up.
                    </CardContent>
                </Card>
            ) : (
                <TournamentWaitlistButton
                    tournamentName={config.name}
                    waiver={waiver}
                />
            )}
        </div>
    )
}
