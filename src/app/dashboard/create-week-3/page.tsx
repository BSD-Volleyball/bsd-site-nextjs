import { requireSessionOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { CreateWeek3Form } from "./create-week-3-form"
import { getCreateWeek3Data } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Create Week 3"
}

export const dynamic = "force-dynamic"

export default async function CreateWeek3Page() {
    await requireSessionOrRedirect()

    const hasAccess = await getIsAdminOrDirector()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getCreateWeek3Data()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Create Week 3"
                    description="Build and save tryout 3 rosters for the current season."
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
                title="Create Week 3"
                description="Place players into division buckets, then generate balanced teams per division."
            />
            <CreateWeek3Form
                seasonLabel={result.seasonLabel}
                divisions={result.divisions}
                candidates={result.candidates}
                excludedPlayers={result.excludedPlayers}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
