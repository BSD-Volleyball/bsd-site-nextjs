import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { requireAdminOrRedirect } from "@/lib/page-guards"
import { getScheduleView } from "./actions"
import { ScheduleEditor } from "./schedule-editor"

export const metadata: Metadata = {
    title: "Tournament Schedule"
}

export default async function TournamentSchedulePage() {
    await requireAdminOrRedirect()

    const result = await getScheduleView()
    const data = result.status ? result.data : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Tournament Schedule"
                description="Set court, start time, and work team for each match."
            />
            {!data ? (
                <p className="text-muted-foreground">
                    No active tournament or no matches generated yet.
                </p>
            ) : (
                <ScheduleEditor view={data} />
            )}
        </div>
    )
}
