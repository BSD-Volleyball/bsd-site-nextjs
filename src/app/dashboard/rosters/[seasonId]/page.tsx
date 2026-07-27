import { requireSessionOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { getRosterData } from "./actions"
import { RosterDivisionSection } from "./roster-division-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Rosters"
}

export const dynamic = "force-dynamic"

export default async function RosterPage({
    params
}: {
    params: Promise<{ seasonId: string }>
}) {
    const session = await requireSessionOrRedirect()

    const { seasonId } = await params
    const result = await getRosterData(parseInt(seasonId, 10))

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader title="Rosters" description="View team rosters." />
                <StatusBanner variant="error">
                    {result.message || "Failed to load roster data."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.data.seasonLabel} Rosters`}
                description="View team rosters by division."
            />
            {result.data.divisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No rosters found for this season.
                </div>
            ) : (
                result.data.divisions.map((division) => (
                    <RosterDivisionSection
                        key={division.id}
                        division={division}
                        currentUserId={session.user.id}
                    />
                ))
            )}
        </div>
    )
}
