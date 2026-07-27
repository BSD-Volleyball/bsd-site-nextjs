import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { getScoreEntryRows } from "./actions"
import { ScoreEntryList } from "./score-entry-list"

export const metadata: Metadata = {
    title: "Enter Tournament Scores"
}

export default async function TournamentScoresPage() {
    await requireSessionOrRedirect()

    const result = await getScoreEntryRows()
    const data = result.status ? result.data : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Enter Tournament Scores"
                description="Your work-team assignments are grouped by pool play and playoffs. Enter the final set scores for each match."
            />
            {!data ? (
                <p className="text-muted-foreground">No active tournament.</p>
            ) : data.view.divisions.length === 0 ? (
                <p className="text-muted-foreground">
                    You have no matches to score right now.
                </p>
            ) : (
                <ScoreEntryList
                    view={data.view}
                    poolSetsCount={data.poolSetsCount}
                    playoffSetsCount={data.playoffSetsCount}
                />
            )}
        </div>
    )
}
