import { requireAdminOrRedirect } from "@/next/page-guards"
import { playerPicBaseUrl } from "@/config/env"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { PairsList } from "./pairs-list"
import { getSeasonPairs } from "./data"
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
                title={`Review Pairs — ${result.data.seasonLabel}`}
                description="Review pair requests for the current season."
            />
            <PairsList
                matched={result.data.matched}
                unmatched={result.data.unmatched}
                incomplete={result.data.incomplete}
                candidates={result.data.candidates}
                playerPicUrl={playerPicBaseUrl()}
            />
        </div>
    )
}
