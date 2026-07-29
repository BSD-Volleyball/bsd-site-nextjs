import { requireAdminOrRedirect } from "@/lib/page-guards"
import { playerPicBaseUrl } from "@/config/env"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { CreateWeek2Form } from "./create-week-2-form"
import { getCreateWeek2Data } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Create Week 2"
}

export const dynamic = "force-dynamic"

export default async function CreateWeek2Page() {
    await requireAdminOrRedirect()

    const result = await getCreateWeek2Data()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Create Week 2"
                    description="Build and save tryout 2 rosters for the current season."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load data."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Create Week 2"
                description="Place players into division buckets, then generate balanced teams per division."
            />
            <CreateWeek2Form
                seasonLabel={result.seasonLabel}
                divisions={result.divisions}
                candidates={result.candidates}
                excludedPlayers={result.excludedPlayers}
                playerPicUrl={playerPicBaseUrl()}
            />
        </div>
    )
}
