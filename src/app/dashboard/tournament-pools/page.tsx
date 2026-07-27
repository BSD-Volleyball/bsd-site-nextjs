import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { requireAdminOrRedirect } from "@/lib/page-guards"
import { getTournamentConfig } from "@/lib/tournament-config"
import {
    getTournamentBracketEditorView,
    getTournamentPoolsView
} from "./actions"
import { TournamentPoolsManager } from "./pools-manager"
import { TournamentBracketEditor } from "./bracket-editor"

export const metadata: Metadata = {
    title: "Tournament Pools"
}

export default async function TournamentPoolsPage() {
    await requireAdminOrRedirect()

    const config = await getTournamentConfig()

    // Once the tournament reaches playoffs, this page becomes a bracket
    // placement editor instead of the pre-playoff pool manager.
    if (config?.phase === "playoffs") {
        const result = await getTournamentBracketEditorView()
        const data = result.status ? result.data : null
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Tournament Playoffs"
                    description="Adjust playoff bracket placements — move teams between games or across divisions, then save."
                />
                {!data ? (
                    <p className="text-muted-foreground">
                        No active tournament.
                    </p>
                ) : (
                    <TournamentBracketEditor view={data} />
                )}
            </div>
        )
    }

    const result = await getTournamentPoolsView()
    const data = result.status ? result.data : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Tournament Pools"
                description="Assign teams to their final division and into pools for round-robin play."
            />
            {!data ? (
                <p className="text-muted-foreground">No active tournament.</p>
            ) : (
                <TournamentPoolsManager view={data} />
            )}
        </div>
    )
}
