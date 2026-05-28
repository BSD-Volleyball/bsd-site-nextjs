import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { auth } from "@/lib/auth"
import { getTournamentWaitlist } from "./actions"
import { TournamentWaitlistTable } from "./waitlist-table"

export const metadata: Metadata = {
    title: "Tournament Waitlist"
}

export default async function ViewTournamentWaitlistPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect("/auth/sign-in")
    const access = await getIsAdminOrDirector()
    if (!access) redirect("/dashboard")

    const result = await getTournamentWaitlist()
    const data = result.status ? result.data : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Tournament Waitlist"
                description="Place players who expressed interest onto teams with capacity."
            />
            {!data ? (
                <p className="text-muted-foreground">No active tournament.</p>
            ) : (
                <TournamentWaitlistTable
                    tournamentName={data.tournamentName}
                    waitlist={data.waitlist}
                    placementTargets={data.placementTargets}
                />
            )}
        </div>
    )
}
