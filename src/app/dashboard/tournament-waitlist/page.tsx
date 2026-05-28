import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { auth } from "@/lib/auth"
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

    return (
        <div className="space-y-6">
            <PageHeader
                title="Join the Tournament Waitlist"
                description={`Express interest in playing in ${config.name}. A captain can pick you up to fill a roster.`}
            />
            <TournamentWaitlistButton
                tournamentName={config.name}
                waiver={waiver}
            />
        </div>
    )
}
