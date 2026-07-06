import { requireAdminOrRedirect } from "@/lib/page-guards"
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
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load waitlist."}
                </div>
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
