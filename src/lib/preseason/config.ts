// Per-week configuration for the shared preseason roster builder
// (create-week-2 / create-week-3). The two weeks share one engine and one
// form; everything that genuinely differs between them is named here.
//
// This module is client-safe: it contains functions, so a config object can
// never cross the RSC boundary — the per-route client form wrappers import
// it directly.

import { buildCascadeDivisionPlacement } from "./division-cascade"
import { buildContinuityDivisionPlacement } from "./division-continuity"
import type { TeamBuildOptions } from "./teams"
import type {
    DivisionPlacementResult,
    PreseasonCandidate,
    PreseasonDivision,
    Week2Candidate,
    Week3Candidate
} from "./types"

// Team counts come from `individual_divisions.teams` for the season. These are
// only the fallback for a division with no season config row — i.e. before
// divisions have been set up for the season.
/** Fallback team count for any division without a season config row… */
export const STANDARD_DIVISION_TEAM_COUNT = 6
/** …except the last (lowest) division. */
export const LAST_DIVISION_TEAM_COUNT = 4

/**
 * Width of one division-level band in placement-score points; used for
 * score-based division fallback and duplicate-entry targeting.
 */
export const SCORE_BAND_WIDTH = 50

/**
 * Tryout slot (1-based, = ceil(teamNumber / 2)) coaches are steered into so
 * they can observe their coaches division: the late 9pm slot.
 */
export const COACH_OBSERVATION_SLOT = 3

export type DivisionPlacementStrategy<C extends PreseasonCandidate> = (
    divisions: PreseasonDivision[],
    candidates: C[]
) => DivisionPlacementResult<C>

export interface PreseasonWeekConfig<C extends PreseasonCandidate> {
    week: 2 | 3
    divisionStrategy: DivisionPlacementStrategy<C>
    teamBuild: TeamBuildOptions
    /**
     * When set, captains of the division at this index are excluded from the
     * roster by default and individually opted back in by the admin.
     */
    captainOptIn: { divisionIndex: number } | null
    /** Step-1 badge style: last-drafted division (week 2) or placement reason (week 3). */
    playerAnnotation: "lastDivision" | "placementReason"
    showPlacementLegend: boolean
    scoreBandWidth: number
    stepOneTargetLabel: string
}

export const WEEK2_CONFIG: PreseasonWeekConfig<Week2Candidate> = {
    week: 2,
    divisionStrategy: buildCascadeDivisionPlacement,
    teamBuild: {
        newPlayersRequireCaptainedTeam: true,
        backCourt: null
    },
    captainOptIn: null,
    playerAnnotation: "lastDivision",
    showPlacementLegend: false,
    scoreBandWidth: SCORE_BAND_WIDTH,
    stepOneTargetLabel: "Dynamic team-size target"
}

export const WEEK3_CONFIG: PreseasonWeekConfig<Week3Candidate> = {
    week: 3,
    divisionStrategy: buildContinuityDivisionPlacement,
    teamBuild: {
        newPlayersRequireCaptainedTeam: false,
        // The back court is a 6-team layout: the trailing 2 of 6. Season
        // config allows a division to be 4 teams instead, and 2 back teams
        // out of 4 is not the same feature, so the back court deliberately
        // stays off unless the top division actually has 6 teams.
        backCourt: {
            divisionIndex: 0,
            requiredTeamCount: STANDARD_DIVISION_TEAM_COUNT,
            backTeamCount: 2
        }
    },
    captainOptIn: { divisionIndex: 0 },
    playerAnnotation: "placementReason",
    showPlacementLegend: true,
    scoreBandWidth: SCORE_BAND_WIDTH,
    stepOneTargetLabel: "Week 3 ideal target"
}
