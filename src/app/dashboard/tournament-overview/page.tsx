import type { Metadata } from "next"
import { playerPicBaseUrl } from "@/config/env"
import { PageHeader } from "@/components/layout/page-header"
import { requireAdminOrRedirect } from "@/lib/page-guards"
import { getTournamentOverview } from "./actions"
import { TournamentOverviewClient } from "./tournament-overview-client"

export const metadata: Metadata = {
    title: "Tournament Overview"
}

export default async function TournamentOverviewPage() {
    await requireAdminOrRedirect()

    const result = await getTournamentOverview()
    const data = result.status ? result.data : null
    const playerPicUrl = playerPicBaseUrl()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Tournament Overview"
                description="Structure, signups, and rosters at a glance."
            />
            {!data ? (
                <p className="text-muted-foreground">
                    No active tournament configured.
                </p>
            ) : (
                <TournamentOverviewClient
                    data={data}
                    playerPicUrl={playerPicUrl}
                />
            )}
        </div>
    )
}
