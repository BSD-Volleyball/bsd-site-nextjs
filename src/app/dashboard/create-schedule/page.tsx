import { requireAdminOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { getCreateScheduleData } from "./actions"
import { CreateScheduleClient } from "./create-schedule-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Create Schedule"
}

export const revalidate = 300

export default async function CreateSchedulePage() {
    await requireAdminOrRedirect()

    const data = await getCreateScheduleData()

    if (!data.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Create Schedule"
                    description="Generate regular season and playoff schedules."
                />
                <StatusBanner variant="error">
                    {data.message || "Failed to load data."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Create Schedule"
                description={`Generate regular season and playoff schedules for ${data.seasonLabel}.`}
            />
            <CreateScheduleClient
                seasonId={data.seasonId}
                seasonLabel={data.seasonLabel}
                seasonName={data.seasonName}
                divisions={data.divisions}
                seasonDates={data.seasonDates}
                playoffDates={data.playoffDates}
            />
        </div>
    )
}
