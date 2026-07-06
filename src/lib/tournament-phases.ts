export const TOURNAMENT_PHASES = [
    "registration_open",
    "prepare_for_tournament",
    "pool_play",
    "playoffs",
    "complete"
] as const

export type TournamentPhase = (typeof TOURNAMENT_PHASES)[number]

export interface TournamentPhaseConfig {
    label: string
    description: string
    adminHint: string
    showRegistration: boolean
    showRosterEdit: boolean
    showPoolTools: boolean
    showBracketTools: boolean
    nextPhases: TournamentPhase[]
    previousPhase: TournamentPhase | null
}

export const TOURNAMENT_PHASE_CONFIG: Record<
    TournamentPhase,
    TournamentPhaseConfig
> = {
    registration_open: {
        label: "Registration Open",
        description:
            "Captains can sign up teams and players can join the waitlist.",
        adminHint:
            "Monitor team signups and the waitlist. Advance when registration closes and you are ready to lock final divisions and pools.",
        showRegistration: true,
        showRosterEdit: true,
        showPoolTools: false,
        showBracketTools: false,
        nextPhases: ["prepare_for_tournament"],
        previousPhase: null
    },
    prepare_for_tournament: {
        label: "Prepare for Tournament",
        description:
            "Registration is closed. Assign teams to final divisions and build pools.",
        adminHint:
            "Place waitlist players, set each team's final division, build pools, and schedule pool play matches before advancing.",
        showRegistration: false,
        showRosterEdit: true,
        showPoolTools: true,
        showBracketTools: false,
        nextPhases: ["pool_play"],
        previousPhase: "registration_open"
    },
    pool_play: {
        label: "Pool Play",
        description: "Pool matches are being played. Work teams enter scores.",
        adminHint:
            "Pool play is live. Work teams enter scores for their assigned matches. Advance to playoffs when pool play is complete.",
        showRegistration: false,
        showRosterEdit: false,
        showPoolTools: true,
        showBracketTools: false,
        nextPhases: ["playoffs"],
        previousPhase: "prepare_for_tournament"
    },
    playoffs: {
        label: "Playoffs",
        description: "Playoff bracket is active.",
        adminHint:
            "Bracket matches are live. The losing team of each completed match becomes the work team for the next match on the same court. Mark the tournament complete when champions are crowned.",
        showRegistration: false,
        showRosterEdit: false,
        showPoolTools: false,
        showBracketTools: true,
        nextPhases: ["complete"],
        previousPhase: "pool_play"
    },
    complete: {
        label: "Complete",
        description: "Tournament is finished.",
        adminHint:
            "Tournament is archived. Create a new tournament to begin another.",
        showRegistration: false,
        showRosterEdit: false,
        showPoolTools: false,
        showBracketTools: false,
        nextPhases: [],
        previousPhase: "playoffs"
    }
}

export function isValidTournamentPhaseTransition(
    currentPhase: TournamentPhase,
    targetPhase: TournamentPhase
): boolean {
    return TOURNAMENT_PHASE_CONFIG[currentPhase].nextPhases.includes(
        targetPhase
    )
}

export function isValidTournamentPhaseRevert(
    currentPhase: TournamentPhase,
    targetPhase: TournamentPhase
): boolean {
    return TOURNAMENT_PHASE_CONFIG[currentPhase].previousPhase === targetPhase
}
