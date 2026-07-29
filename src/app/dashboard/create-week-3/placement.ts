// Week-3 bindings for the shared preseason placement engine
// (src/lib/preseason): continuity division strategy + team engine with the
// week-3 rule set (no new-player constraint, top-division back court).

import { buildContinuityDivisionPlacement } from "@/lib/preseason/division-continuity"
import {
    buildTeamsForDivision as buildTeamsForDivisionWithOptions,
    type TeamBucket
} from "@/lib/preseason/teams"
import type {
    DivisionPlacement as PreseasonDivisionPlacement,
    DivisionPlacementResult,
    PlacedPlayer,
    PlacementUnit as PreseasonPlacementUnit,
    Week3Candidate
} from "@/lib/preseason/types"
import type { Week3Division } from "./week3-types"

export {
    addUnitToPlacement,
    buildPlacementUnits,
    compareCandidates,
    getDisplayName,
    removeUnitFromPlacement,
    sortDivisionPlayers,
    toOriginalPlacedPlayer
} from "@/lib/preseason/units"
export {
    allocateByWeightWithCapacity,
    getDivisionTargets,
    getSnakeOrder
} from "@/lib/preseason/allocation"
export { buildTeamUnits } from "@/lib/preseason/teams"
export type { TeamBucket, TeamPlayer } from "@/lib/preseason/teams"
export type { PlacementReason } from "@/lib/preseason/types"
export {
    placementReasonClasses,
    placementReasonLabel,
    placementReasonOrder
} from "@/lib/preseason/placement-shared"

export type Week3PlacedPlayer = PlacedPlayer<Week3Candidate>
export type PlacementUnit = PreseasonPlacementUnit<Week3Candidate>
export type DivisionPlacement = PreseasonDivisionPlacement<Week3Candidate>

export function buildDivisionPlacement(
    divisions: Week3Division[],
    candidates: Week3Candidate[]
): DivisionPlacementResult<Week3Candidate> {
    return buildContinuityDivisionPlacement(divisions, candidates)
}

export function buildTeamsForDivision(
    division: Week3Division,
    players: Week3PlacedPlayer[],
    isTopDivision = false
): TeamBucket[] {
    return buildTeamsForDivisionWithOptions(division, players, {
        newPlayersRequireCaptainedTeam: false,
        backCourt: isTopDivision
            ? {
                  divisionIndex: division.index,
                  requiredTeamCount: 6,
                  backTeamCount: 2
              }
            : null
    })
}
