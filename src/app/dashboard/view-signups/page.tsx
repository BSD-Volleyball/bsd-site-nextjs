import { PageHeader } from "@/components/layout/page-header"
import { playerPicBaseUrl } from "@/config/env"
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

    const data = result.data

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${data.seasonLabel} Signups`}
                description="Players signed up for the current season, grouped by their last drafted division."
            />
            {data.undraftedGroups.length === 0 &&
            data.draftedGroups.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No signups found for this season.
                </div>
            ) : (
                <SignupsList
                    undraftedGroups={data.undraftedGroups}
                    draftedGroups={data.draftedGroups}
                    allSeasons={data.allSeasons}
                    playerPicUrl={playerPicBaseUrl()}
                    seasonLabel={data.seasonLabel}
                />
            )}
        </div>
    )
}
