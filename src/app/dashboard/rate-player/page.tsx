import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasCaptainPagesAccessBySession } from "@/lib/rbac"
import { getRatePlayerData } from "./actions"
import { RatePlayerClient } from "./rate-player-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Rate Player"
}

export const dynamic = "force-dynamic"

export default async function RatePlayerPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

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
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load players."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`Rate Player — ${result.seasonLabel}`}
                description="Choose a lookup type and rate players using shared and private notes."
            />
            <RatePlayerClient
                players={result.players}
                tryout1Sessions={result.tryout1Sessions}
                initialRatings={result.ratingsByPlayer}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
