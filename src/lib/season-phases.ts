export const SEASON_PHASES = [
    "off_season",
    "registration_open",
    "registration_closed",
    "tryout_week_1",
    "tryout_week_2",
    "tryout_week_3",
    "draft",
    "regular_season",
    "playoffs",
    "complete"
] as const

export type SeasonPhase = (typeof SEASON_PHASES)[number]

export interface PhaseConfig {
    label: string
    description: string
    adminHint: string
    showRegistration: boolean
    showTryoutTools: boolean
    showDraftTools: boolean
    showSeasonTools: boolean
    showPlayoffTools: boolean
    nextPhases: SeasonPhase[]
    previousPhase: SeasonPhase | null
}

export const PHASE_CONFIG: Record<SeasonPhase, PhaseConfig> = {
    off_season: {
        label: "Off-Season",
        description:
            "No active season. Set up dates and pricing before opening registration.",
        adminHint:
            "Configure season dates, pricing, and max players before opening registration.",
        showRegistration: false,
        showTryoutTools: false,
        showDraftTools: false,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: ["registration_open"],
        previousPhase: null
    },
    registration_open: {
        label: "Registration Open",
        description: "Players can sign up and pay for the season.",
        adminHint:
            "Monitor signups. Close registration when ready for tryouts.",
        showRegistration: true,
        showTryoutTools: false,
        showDraftTools: false,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: ["registration_closed"],
        previousPhase: "off_season"
    },
    registration_closed: {
        label: "Registration Closed",
        description: "Registration is closed. Prepare for tryout week 1.",
        adminHint:
            "Create Week 1 rosters and finalize the waitlist. Advance when ready for tryouts.",
        showRegistration: false,
        showTryoutTools: true,
        showDraftTools: false,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: ["tryout_week_1", "registration_open"],
        previousPhase: "registration_open"
    },
    tryout_week_1: {
        label: "Tryout Week 1",
        description: "Week 1 tryouts for new and legacy player evaluation.",
        adminHint:
            "Evaluate new players after tryouts. Advance to Week 2 when done.",
        showRegistration: false,
        showTryoutTools: true,
        showDraftTools: false,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: ["tryout_week_2"],
        previousPhase: "registration_closed"
    },
    tryout_week_2: {
        label: "Tryout Week 2",
        description: "Week 2 tryouts for all players.",
        adminHint: "Rate players, review pairs. Advance to Week 3 when done.",
        showRegistration: false,
        showTryoutTools: true,
        showDraftTools: false,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: ["tryout_week_3"],
        previousPhase: "tryout_week_1"
    },
    tryout_week_3: {
        label: "Tryout Week 3",
        description: "Week 3 tryouts and final evaluation.",
        adminHint:
            "Finalize evaluations and ratings. Select captains and create teams before advancing to draft.",
        showRegistration: false,
        showTryoutTools: true,
        showDraftTools: true,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: ["draft"],
        previousPhase: "tryout_week_2"
    },
    draft: {
        label: "Draft",
        description: "Commissioners draft players onto teams.",
        adminHint:
            "Commissioners should complete drafts for all divisions. Advance when all divisions are drafted.",
        showRegistration: false,
        showTryoutTools: false,
        showDraftTools: true,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: ["regular_season"],
        previousPhase: "tryout_week_3"
    },
    regular_season: {
        label: "Regular Season",
        description: "Games are being played. Enter scores weekly.",
        adminHint:
            "Enter match scores each week. Advance to playoffs when regular season is complete.",
        showRegistration: false,
        showTryoutTools: false,
        showDraftTools: false,
        showSeasonTools: true,
        showPlayoffTools: false,
        nextPhases: ["playoffs"],
        previousPhase: "draft"
    },
    playoffs: {
        label: "Playoffs",
        description: "Playoff bracket is active.",
        adminHint:
            "Enter playoff scores. Mark season complete when champions are crowned.",
        showRegistration: false,
        showTryoutTools: false,
        showDraftTools: false,
        showSeasonTools: false,
        showPlayoffTools: true,
        nextPhases: ["complete"],
        previousPhase: "regular_season"
    },
    complete: {
        label: "Complete",
        description: "Season is finished. Champions recorded.",
        adminHint:
            "Season is archived. Create a new season to begin the next cycle.",
        showRegistration: false,
        showTryoutTools: false,
        showDraftTools: false,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: [],
        previousPhase: "playoffs"
    }
}

export function isActivePhase(phase: SeasonPhase): boolean {
    return phase !== "off_season" && phase !== "complete"
}

export function isValidPhaseTransition(
    currentPhase: SeasonPhase,
    targetPhase: SeasonPhase
): boolean {
    const config = PHASE_CONFIG[currentPhase]
    return config.nextPhases.includes(targetPhase)
}

export function isValidPhaseRevert(
    currentPhase: SeasonPhase,
    targetPhase: SeasonPhase
): boolean {
    const config = PHASE_CONFIG[currentPhase]
    return config.previousPhase === targetPhase
}
