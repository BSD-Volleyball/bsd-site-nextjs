import { redirect } from "next/navigation"
import { StatusBanner } from "@/components/ui/status-banner"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { DraftDayForm } from "./draft-day-form"
import { getDraftDayData } from "./actions"
import { getIsCommissioner } from "@/app/dashboard/actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Draft Day"
}

export const dynamic = "force-dynamic"

export default async function DraftDayPage() {
    await requireSessionOrRedirect()

    const hasAccess = await getIsCommissioner()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getDraftDayData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Draft Day"
                    description="Set the draft pick order for each division."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load draft day data."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Draft Day`}
                description="Set and save the captain draft pick order for each division."
            />
            <DraftDayForm
                divisions={result.divisions}
                commissionerDivisionId={result.commissionerDivisionId}
                seasonLabel={result.seasonLabel}
            />
        </div>
    )
}
