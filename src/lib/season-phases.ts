export const SEASON_PHASES = [
    "off_season",
    "registration_open",
    "select_commissioners",
    "select_captains",
    "prep_tryout_week_1",
    "prep_tryout_week_2",
    "prep_tryout_week_3",
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
            "Monitor signups. Close registration when ready to select commissioners.",
        showRegistration: true,
        showTryoutTools: false,
        showDraftTools: false,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: ["select_commissioners"],
        previousPhase: "off_season"
    },
    select_commissioners: {
        label: "Select Commissioners",
        description:
            "Registration is closed. Assign commissioners for each division.",
        adminHint:
            "Assign commissioners for the season. Advance when all divisions have commissioners.",
        showRegistration: false,
        showTryoutTools: true,
        showDraftTools: false,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: ["select_captains"],
        previousPhase: "registration_open"
    },
    select_captains: {
        label: "Select Captains",
        description: "Commissioners select team captains for their divisions.",
        adminHint:
            "Commissioners should identify and select captains. Advance when captains are confirmed.",
        showRegistration: false,
        showTryoutTools: true,
        showDraftTools: false,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: ["prep_tryout_week_1"],
        previousPhase: "select_commissioners"
    },
    prep_tryout_week_1: {
        label: "Prepare for Tryout Week 1",
        description: "Prepare Week 1 tryout rosters and logistics.",
        adminHint:
            "Create Week 1 rosters and finalize preparations. Advance after tryout week 1 is complete.",
        showRegistration: false,
        showTryoutTools: true,
        showDraftTools: false,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: ["prep_tryout_week_2"],
        previousPhase: "select_captains"
    },
    prep_tryout_week_2: {
        label: "Prepare for Tryout Week 2",
        description:
            "Evaluate Week 1 results and prepare Week 2 tryout rosters.",
        adminHint:
            "Evaluate new players, create Week 2 rosters. Advance after tryout week 2 is complete.",
        showRegistration: false,
        showTryoutTools: true,
        showDraftTools: false,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: ["prep_tryout_week_3"],
        previousPhase: "prep_tryout_week_1"
    },
    prep_tryout_week_3: {
        label: "Prepare for Tryout Week 3",
        description:
            "Evaluate Week 2 results and prepare Week 3 tryout rosters.",
        adminHint:
            "Rate players, review pairs, finalize evaluations. Advance after tryout week 3 is complete.",
        showRegistration: false,
        showTryoutTools: true,
        showDraftTools: true,
        showSeasonTools: false,
        showPlayoffTools: false,
        nextPhases: ["draft"],
        previousPhase: "prep_tryout_week_2"
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
        previousPhase: "prep_tryout_week_3"
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
