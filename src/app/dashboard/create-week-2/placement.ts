// Week-2 bindings for the shared preseason placement engine
// (src/lib/preseason): cascade division strategy + team engine with the
// week-2 rule set (new players require a captained team, no back court).

import { buildCascadeDivisionPlacement } from "@/lib/preseason/division-cascade"
import {
    buildTeamsForDivision as buildTeamsForDivisionWithOptions,
    type TeamBucket
} from "@/lib/preseason/teams"
import type {
    DivisionPlacement as PreseasonDivisionPlacement,
    PlacedPlayer,
    PlacementUnit as PreseasonPlacementUnit,
    Week2Candidate
} from "@/lib/preseason/types"
import type { Week2Division } from "./week2-types"

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

export type Week2PlacedPlayer = PlacedPlayer<Week2Candidate>
export type PlacementUnit = PreseasonPlacementUnit<Week2Candidate>
export type DivisionPlacement = PreseasonDivisionPlacement<Week2Candidate>

export function buildDivisionPlacement(
    divisions: Week2Division[],
    candidates: Week2Candidate[]
): Map<number, DivisionPlacement> {
    return buildCascadeDivisionPlacement(divisions, candidates).placement
}

export function buildTeamsForDivision(
    division: Week2Division,
    players: Week2PlacedPlayer[]
): TeamBucket[] {
    return buildTeamsForDivisionWithOptions(division, players, {
        newPlayersRequireCaptainedTeam: true,
        backCourt: null
    })
}
