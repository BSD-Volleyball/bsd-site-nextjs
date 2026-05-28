import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { getActiveWaiver } from "@/lib/waivers"
import {
    getTournamentAvailability,
    getTournamentConfig,
    getCurrentTournamentCost,
    isRegistrationClosed,
    isUserOnTournamentRoster
} from "@/lib/tournament-config"
import { getEligibleTournamentPlayers } from "./actions"
import { TournamentSignupWizard } from "./wizard-form"

function fmtTournamentDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    })
}

export const metadata: Metadata = {
    title: "Sign Up for Tournament"
}

export default async function TournamentSignupPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect("/auth/sign-in")

    const config = await getTournamentConfig()
    if (!config) redirect("/dashboard")
    if (isRegistrationClosed(config)) redirect("/dashboard")
    if (await isUserOnTournamentRoster(config.tournamentId, session.user.id)) {
        redirect("/dashboard/tournament-team")
    }

    const availability = await getTournamentAvailability(config)
    if (availability.allDivisionsFull) {
        // Every division is at capacity — no team can sign up. The
        // dashboard card surfaces the waitlist instead.
        redirect("/dashboard")
    }

    const activeWaiver = await getActiveWaiver()
    if (!activeWaiver) {
        return (
            <p className="text-muted-foreground">
                No active waiver — please contact an administrator.
            </p>
        )
    }

    const [eligibleResult, captainRow] = await Promise.all([
        getEligibleTournamentPlayers(config.tournamentId),
        db
            .select({ male: users.male })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1)
    ])
    const eligible = eligibleResult.status ? eligibleResult.data : []
    const currentCost = getCurrentTournamentCost(config)
    const currentUserMale = captainRow[0]?.male ?? null

    return (
        <div className="space-y-6">
            <PageHeader
                title={`Sign Up: ${config.name}`}
                description={`Team fee $${currentCost}`}
            />
            <p className="-mt-6 text-muted-foreground">
                Date: {fmtTournamentDate(config.tournamentDate)}
            </p>
            <TournamentSignupWizard
                tournament={{
                    id: config.tournamentId,
                    name: config.name,
                    divisions: config.divisions,
                    cost: currentCost
                }}
                divisionAvailability={availability.divisions}
                currentUserId={session.user.id}
                currentUserMale={currentUserMale}
                eligiblePlayers={eligible}
                activeWaiver={activeWaiver}
                squareAppId={process.env.NEXT_PUBLIC_SQUARE_APP_ID || ""}
                squareLocationId={
                    process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || ""
                }
            />
        </div>
    )
}
