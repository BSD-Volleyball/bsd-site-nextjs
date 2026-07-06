import { requireAdminOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { PairsList } from "./pairs-list"
import { getSeasonPairs } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Review Pairs"
}

export const dynamic = "force-dynamic"

export default async function ReviewPairsPage() {
    await requireAdminOrRedirect()

    const result = await getSeasonPairs()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Review Pairs"
                    description="Review pair requests for the current season."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load pairs."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`Review Pairs — ${result.seasonLabel}`}
                description="Review pair requests for the current season."
            />
            <PairsList
                matched={result.matched}
                unmatched={result.unmatched}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
