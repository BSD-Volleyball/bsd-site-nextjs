import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { requireAdminOrRedirect } from "@/lib/page-guards"
import { getTournamentWaitlist } from "./actions"
import { TournamentWaitlistTable } from "./waitlist-table"

export const metadata: Metadata = {
    title: "Place Tournament Players"
}

export default async function ViewTournamentWaitlistPage() {
    await requireAdminOrRedirect()

    const result = await getTournamentWaitlist()
    const data = result.status ? result.data : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Place Tournament Players"
                description="Players who've signed up looking for a team. Place them onto rosters that still have capacity."
            />
            {!data ? (
                <p className="text-muted-foreground">No active tournament.</p>
            ) : (
                <TournamentWaitlistTable
                    tournamentName={data.tournamentName}
                    waitlist={data.waitlist}
                    placementTargets={data.placementTargets}
                />
            )}
        </div>
    )
}
