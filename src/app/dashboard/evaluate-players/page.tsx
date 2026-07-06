import { requireAdminOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { EvaluatePlayersList } from "./evaluate-players-list"
import { getNewPlayers } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Evaluate New Players"
}

export const revalidate = 300

export default async function EvaluatePlayersPage() {
    await requireAdminOrRedirect()

    const result = await getNewPlayers()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Evaluate New Players"
                    description="Assign division evaluations to new players."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load players."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`Evaluate New Players — ${result.seasonLabel}`}
                description="Assign division evaluations to new players who have not been previously drafted."
            />
            <EvaluatePlayersList
                players={result.players}
                divisions={result.divisions}
            />
        </div>
    )
}
