import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { auth } from "@/lib/auth"
import { getScoreEntryRows } from "./actions"
import { ScoreEntryList } from "./score-entry-list"

export const metadata: Metadata = {
    title: "Enter Tournament Scores"
}

export default async function TournamentScoresPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect("/auth/sign-in")

    const result = await getScoreEntryRows()
    const data = result.status ? result.data : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Enter Tournament Scores"
                description="Your work-team assignments are listed here. Enter the final set scores for each match."
            />
            {!data ? (
                <p className="text-muted-foreground">No active tournament.</p>
            ) : data.rows.length === 0 ? (
                <p className="text-muted-foreground">
                    You have no matches to score right now.
                </p>
            ) : (
                <ScoreEntryList rows={data.rows} />
            )}
        </div>
    )
}
