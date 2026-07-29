import { PageHeader } from "@/components/layout/page-header"
import { requireAdminOrRedirect } from "@/lib/page-guards"
import type { Metadata } from "next"
import {
    getCurrentTournamentPhaseData,
    getTournamentPlacements
} from "./actions"
import { TournamentPhaseControl } from "./tournament-phase-control"
import { EndTournamentEarlyCard } from "./end-tournament-early-card"
import { CreateTournamentCard } from "./create-tournament-card"
import { TournamentPlacementsCard } from "@/components/tournament/tournament-placements-card"
import { TOURNAMENT_PHASE_CONFIG } from "@/lib/tournament-phases"

export const metadata: Metadata = {
    title: "Tournament Control"
}

export default async function TournamentControlPage() {
    await requireAdminOrRedirect()

    const result = await getCurrentTournamentPhaseData()
    const data = result.status ? result.data : null

    const canEndEarly =
        data?.phase === "pool_play" || data?.phase === "playoffs"

    const placementsResult =
        data?.phase === "complete"
            ? await getTournamentPlacements(data.tournamentId)
            : null
    const placements = placementsResult?.status ? placementsResult.data : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Tournament Control"
                description="Advance tournament phases as the day progresses."
            />
            {data ? (
                <>
                    <TournamentPhaseControl
                        tournamentId={data.tournamentId}
                        label={data.label}
                        initialPhase={data.phase}
                    />
                    {placements && (
                        <TournamentPlacementsCard divisions={placements} />
                    )}
                    {canEndEarly && (
                        <EndTournamentEarlyCard
                            tournamentId={data.tournamentId}
                        />
                    )}
                    <CreateTournamentCard
                        currentTournamentLabel={data.label}
                        currentPhaseLabel={
                            TOURNAMENT_PHASE_CONFIG[data.phase].label
                        }
                        currentPhaseIsComplete={data.phase === "complete"}
                    />
                </>
            ) : (
                <>
                    <p className="text-muted-foreground">
                        No tournament exists yet.
                    </p>
                    <CreateTournamentCard />
                </>
            )}
        </div>
    )
}
