import { PageHeader } from "@/components/layout/page-header"
import { PlayerLookupSignupsForm } from "./player-lookup-form"
import { getSignedUpPlayers } from "./actions"
import { requireCaptainAccessOrRedirect } from "@/lib/page-guards"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Player Lookup"
}

export const dynamic = "force-dynamic"

export default async function PlayerLookupSignupsPage() {
    await requireCaptainAccessOrRedirect()

    const result = await getSignedUpPlayers()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Player Lookup"
                    description="Search and view details of signed-up players."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load player data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Player Lookup"
                description="Search and view details of players signed up for the current season."
            />
            <PlayerLookupSignupsForm
                players={result.data.players}
                allSeasons={result.data.allSeasons}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
