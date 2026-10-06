import { redirect } from "next/navigation"
import { playerPicBaseUrl } from "@/config/env"
import { StatusBanner } from "@/components/ui/status-banner"
import { requireSessionOrRedirect } from "@/next/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { hasCaptainPagesAccessBySession } from "@/next/session"
import { getRatePlayerData } from "./actions"
import { RatePlayerClient } from "./rate-player-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Rate Player"
}

export const dynamic = "force-dynamic"

export default async function RatePlayerPage() {
    await requireSessionOrRedirect()

    const hasAccess = await hasCaptainPagesAccessBySession()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getRatePlayerData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Rate Player"
                    description="Rate signed-up players for the active season."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load players."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`Rate Player — ${result.data.seasonLabel}`}
                description="Choose a lookup type and rate players using shared and private notes."
            />
            <RatePlayerClient
                players={result.data.players}
                tryout1Sessions={result.data.tryout1Sessions}
                tryout2Divisions={result.data.tryout2Divisions}
                tryout3Divisions={result.data.tryout3Divisions}
                tryout2TimeSlots={result.data.tryout2TimeSlots}
                tryout3TimeSlots={result.data.tryout3TimeSlots}
                byTeamDivisions={result.data.byTeamDivisions}
                captainTeam={result.data.captainTeam}
                defaultLookupType={result.data.defaultLookupType}
                initialRatings={result.data.ratingsByPlayer}
                ratedPlayers={result.data.ratedPlayers}
                ratedSeasons={result.data.ratedSeasons}
                currentSeasonId={result.data.currentSeasonId}
                currentSeasonLabel={result.data.seasonLabel}
                playerPicUrl={playerPicBaseUrl()}
            />
        </div>
    )
}
