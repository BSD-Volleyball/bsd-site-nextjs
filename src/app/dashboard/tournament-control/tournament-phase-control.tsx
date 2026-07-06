"use client"

import {
    TOURNAMENT_PHASES,
    TOURNAMENT_PHASE_CONFIG,
    type TournamentPhase
} from "@/lib/tournament-phases"
import { PhaseControl } from "@/components/phase-control"
import { advanceTournamentPhase, revertTournamentPhase } from "./actions"

interface Props {
    tournamentId: number
    label: string
    initialPhase: TournamentPhase
}

export function TournamentPhaseControl({
    tournamentId,
    label,
    initialPhase
}: Props) {
    return (
        <PhaseControl
            title={label}
            entityNoun="Tournament"
            phases={TOURNAMENT_PHASES}
            phaseConfig={TOURNAMENT_PHASE_CONFIG}
            initialPhase={initialPhase}
            onAdvance={async (target) => {
                const result = await advanceTournamentPhase(
                    tournamentId,
                    target
                )
                return result.status
                    ? { status: true, message: result.data.message }
                    : result
            }}
            onRevert={async (target) => {
                const result = await revertTournamentPhase(tournamentId, target)
                return result.status
                    ? { status: true, message: result.data.message }
                    : result
            }}
        />
    )
}
