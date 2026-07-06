import { requireSessionOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector } from "@/app/dashboard/access-actions"
import { CreateWeek1Form } from "./create-week-1-form"
import { getCreateWeek1Data } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Create Week 1"
}

export const dynamic = "force-dynamic"

export default async function CreateWeek1Page() {
    await requireSessionOrRedirect()

    const hasAccess = await getIsAdminOrDirector()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getCreateWeek1Data()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Create Week 1"
                    description="Build and save week 1 rosters for the current season."
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
                title="Create Week 1"
                description="Prioritize week 1 candidates, select the top 96, and assign them to sessions/courts."
            />
            <CreateWeek1Form
                seasonLabel={result.seasonLabel}
                candidates={result.candidates}
                groups={result.groups}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
