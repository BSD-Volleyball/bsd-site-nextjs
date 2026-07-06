"use client"

import {
    SEASON_PHASES,
    PHASE_CONFIG,
    type SeasonPhase
} from "@/lib/season-phases"
import { PhaseControl } from "@/components/phase-control"
import { advanceSeasonPhase, revertSeasonPhase } from "./actions"

interface SeasonPhaseControlProps {
    seasonId: number
    seasonLabel: string
    initialPhase: SeasonPhase
}

export function SeasonPhaseControl({
    seasonId,
    seasonLabel,
    initialPhase
}: SeasonPhaseControlProps) {
    return (
        <PhaseControl
            title={`${seasonLabel} Season`}
            entityNoun="Season"
            phases={SEASON_PHASES}
            phaseConfig={PHASE_CONFIG}
            initialPhase={initialPhase}
            onAdvance={(target) => advanceSeasonPhase(seasonId, target)}
            onRevert={(target) => revertSeasonPhase(seasonId, target)}
        />
    )
}
