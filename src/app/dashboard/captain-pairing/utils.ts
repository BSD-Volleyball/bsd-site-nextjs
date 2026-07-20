import { SEASON_PHASES, type SeasonPhase } from "@/lib/season-phases"

export interface SignupPreferences {
    captain: string
    pair: boolean
    pairPick: string | null
    pairReason: string
}

// Editing captain/pair choices is only allowed before the draft phase.
export function canEditPreferences(phase: SeasonPhase): boolean {
    return SEASON_PHASES.indexOf(phase) < SEASON_PHASES.indexOf("draft")
}
