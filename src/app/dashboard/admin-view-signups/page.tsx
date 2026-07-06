import { requireAdminOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { SignupsList } from "./signups-list"
import { getSeasonSignups, getDeletedSignups } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Admin View Signups"
}

export const revalidate = 300

export default async function ViewSignupsPage() {
    await requireAdminOrRedirect()

    const [result, deletedResult] = await Promise.all([
        getSeasonSignups(),
        getDeletedSignups()
    ])

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Admin View Signups"
                    description="View all players signed up for the current season."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load signups."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`Admin View Signups — ${result.seasonLabel}`}
                description="View all players signed up for the current season. New players are highlighted in blue."
            />
            <SignupsList
                signups={result.signups}
                deletedSignups={deletedResult.entries}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
                seasonLabel={result.seasonLabel}
                lateAmount={result.lateAmount}
            />
        </div>
    )
}
