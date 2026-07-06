import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector } from "@/app/dashboard/access-actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { getCurrentTournamentPhaseData } from "./actions"
import { TournamentPhaseControl } from "./tournament-phase-control"

export const metadata: Metadata = {
    title: "Tournament Control"
}

export default async function TournamentControlPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect("/auth/sign-in")
    const hasAccess = await getIsAdminOrDirector()
    if (!hasAccess) redirect("/dashboard")

    const result = await getCurrentTournamentPhaseData()
    const data = result.status ? result.data : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Tournament Control"
                description="Advance tournament phases as the day progresses."
            />
            {data ? (
                <TournamentPhaseControl
                    tournamentId={data.tournamentId}
                    label={data.label}
                    initialPhase={data.phase}
                />
            ) : (
                <p className="text-muted-foreground">
                    No tournament exists yet. Use Tournament Configuration to
                    create one.
                </p>
            )}
        </div>
    )
}
