import { PageHeader } from "@/components/layout/page-header"
import { StatusBanner } from "@/components/ui/status-banner"
import { SignupsList } from "./signups-list"
import { getSignupsData } from "./actions"
import { requireCaptainAccessOrRedirect } from "@/lib/page-guards"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "View Signups"
}

export const revalidate = 300

export default async function ViewSignupsPage() {
    await requireCaptainAccessOrRedirect()

    const result = await getSignupsData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="View Signups"
                    description="View all players signed up for the current season."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load signups data."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Signups`}
                description="Players signed up for the current season, grouped by their last drafted division."
            />
            {result.undraftedGroups.length === 0 &&
            result.draftedGroups.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No signups found for this season.
                </div>
            ) : (
                <SignupsList
                    undraftedGroups={result.undraftedGroups}
                    draftedGroups={result.draftedGroups}
                    allSeasons={result.allSeasons}
                    playerPicUrl={process.env.PLAYER_PIC_URL || ""}
                    seasonLabel={result.seasonLabel}
                />
            )}
        </div>
    )
}
