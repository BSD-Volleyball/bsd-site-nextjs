import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { getTournamentScheduleView } from "./actions"
import { ScheduleView } from "./schedule-view"

export const metadata: Metadata = {
    title: "Schedule & Bracket"
}

export default async function TournamentScheduleViewPage() {
    const result = await getTournamentScheduleView()

    // getTournamentScheduleView enforces session + participant/admin access.
    // A failed result means the viewer isn't part of this tournament.
    if (!result.status) redirect("/dashboard")

    const view = result.data

    return (
        <div className="space-y-6">
            <PageHeader
                title="Schedule & Bracket"
                description={
                    view
                        ? view.tournamentName
                        : "Round-robin schedule and playoff bracket."
                }
            />
            {!view ? (
                <p className="text-muted-foreground text-sm">
                    There's no active tournament right now.
                </p>
            ) : (
                <ScheduleView view={view} />
            )}
        </div>
    )
}
