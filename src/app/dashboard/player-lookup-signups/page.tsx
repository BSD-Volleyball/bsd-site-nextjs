import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { PlayerLookupSignupsForm } from "./player-lookup-form"
import { getSignedUpPlayers } from "./actions"
import { checkViewSignupsAccess } from "@/app/dashboard/view-signups/actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Player Lookup"
}

export const dynamic = "force-dynamic"

export default async function PlayerLookupSignupsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await checkViewSignupsAccess()

    if (!hasAccess) {
        redirect("/dashboard")
    }

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
                players={result.players}
                allSeasons={result.allSeasons}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
