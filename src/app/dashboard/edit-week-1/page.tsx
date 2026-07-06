import { redirect } from "next/navigation"
import { StatusBanner } from "@/components/ui/status-banner"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { getEditWeek1Data } from "./actions"
import { EditWeek1Form } from "./edit-week-1-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Edit Week 1"
}

export const dynamic = "force-dynamic"

export default async function EditWeek1Page() {
    await requireSessionOrRedirect()

    const hasAccess = await getIsAdminOrDirector()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getEditWeek1Data()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Edit Week 1"
                    description="Edit preseason week 1 roster assignments for the current season."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load week 1 roster data."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Edit Week 1`}
                description="Edit player assignments for each session and court, then save changes."
            />
            <EditWeek1Form
                players={result.players}
                slots={result.slots}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
                seasonLabel={result.seasonLabel}
            />
        </div>
    )
}
