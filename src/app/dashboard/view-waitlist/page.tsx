import { requireAdminOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { WaitlistList } from "./waitlist-list"
import { getSeasonWaitlist } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "View Waitlist"
}

export const dynamic = "force-dynamic"

export default async function ViewWaitlistPage() {
    await requireAdminOrRedirect()

    const result = await getSeasonWaitlist()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="View Waitlist"
                    description="View all players on the waitlist for the current season."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load waitlist."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`View Waitlist — ${result.data.seasonLabel}`}
                description="View all players who have expressed interest in playing if a spot opens up."
            />
            <WaitlistList
                entries={result.data.entries}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
