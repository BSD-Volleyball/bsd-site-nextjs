import { requireSessionOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { getSeasonScheduleData } from "./actions"
import { DivisionSection } from "./division-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Season Schedule"
}

export const dynamic = "force-dynamic"

export default async function SchedulePage({
    params
}: {
    params: Promise<{ seasonId: string }>
}) {
    await requireSessionOrRedirect()

    const { seasonId } = await params
    const result = await getSeasonScheduleData(parseInt(seasonId, 10))

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Season Schedule"
                    description="View standings, schedule, and results."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load season schedule data."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} Season`}
                description="Standings, schedule, and results by division."
            />
            {result.divisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No season schedule data found for this season.
                </div>
            ) : (
                result.divisions.map((division) => (
                    <DivisionSection key={division.id} division={division} />
                ))
            )}
        </div>
    )
}
