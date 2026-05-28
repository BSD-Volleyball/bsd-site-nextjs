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
    title: "Sign Up as a Player"
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
                title="Sign Up as a Player"
                description={`Let us know you'd like to play in ${config.name} so a captain can add you to their team.`}
            />

            {alreadyOnList ? (
                <Card className="border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950">
                    <CardContent className="space-y-3 pt-6 text-sm">
                        <p className="font-medium">
                            Thanks for signing up to play in {config.name}!
                        </p>
                        <p>
                            You're not on a team yet. If you already know which
                            captain plans to add you, please reach out so they
                            can put you on their roster. Otherwise we'll contact
                            you if we can place you on a team.
                        </p>
                        <p className="text-muted-foreground text-xs">
                            Your waiver is on file, so you're cleared to play as
                            soon as a captain adds you.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                Why sign up?
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <p>
                                <strong>If you don't have a team yet:</strong>{" "}
                                signing up tells captains you're available to
                                play — they'll see your name when filling
                                rosters.
                            </p>
                            <p>
                                <strong>
                                    If you know a captain plans to add you:
                                </strong>{" "}
                                signing up here pre-accepts the waiver so you're
                                cleared to play the moment they put you on their
                                roster.
                            </p>
                        </CardContent>
                    </Card>
                    <TournamentWaitlistButton
                        tournamentName={config.name}
                        waiver={waiver}
                        divisions={config.divisions.map((d) => ({
                            id: d.id,
                            name: d.divisionName
                        }))}
                    />
                </>
            )}
        </div>
    )
}
