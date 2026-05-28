import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { auth } from "@/lib/auth"
import { getCaptainTeamView } from "./actions"
import { CaptainTeamEditor } from "./captain-team-editor"

export const metadata: Metadata = {
    title: "My Tournament Team"
}

export default async function TournamentTeamPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect("/auth/sign-in")

    const result = await getCaptainTeamView()
    const view = result.status ? result.data : null

    if (!view) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="My Tournament Team"
                    description="Manage your tournament roster."
                />
                <p className="text-muted-foreground">
                    You are not a captain of any team in the current tournament.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${view.team.name} — ${view.tournamentName}`}
                description={
                    view.rosterLocked
                        ? "Roster is locked. Contact an admin for changes."
                        : "Add or remove players, and update your preferred division."
                }
            />
            <CaptainTeamEditor view={view} />
        </div>
    )
}
