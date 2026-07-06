import { redirect } from "next/navigation"
import { StatusBanner } from "@/components/ui/status-banner"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector } from "@/app/dashboard/access-actions"
import { getEditWeek2Data } from "./actions"
import { EditWeek2Form } from "./edit-week-2-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Edit Week 2"
}

export const dynamic = "force-dynamic"

export default async function EditWeek2Page() {
    await requireSessionOrRedirect()

    const hasAccess = await getIsAdminOrDirector()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getEditWeek2Data()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Edit Week 2"
                    description="Edit tryout 2 team assignments for the current season."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load week 2 roster data."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Edit Week 2`}
                description="Edit player assignments by division/team, then save changes."
            />
            {result.slots.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No week 2 roster slots found for this season.
                </div>
            ) : (
                <EditWeek2Form
                    players={result.players}
                    slots={result.slots}
                    playerPicUrl={process.env.PLAYER_PIC_URL || ""}
                    seasonLabel={result.seasonLabel}
                />
            )}
        </div>
    )
}
