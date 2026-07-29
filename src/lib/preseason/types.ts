// Shared types for the preseason week-2/3 roster builders.
// Week 1 (tryout top-96, sessions × courts) uses a different algorithm and
// schema and intentionally does not share these types.

export interface PreseasonDivision {
    id: number
    name: string
    level: number
    index: number
    teamCount: number
    isLast: boolean
    usesCoaches: boolean
}

export interface PreseasonCandidate {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    pairUserId: string | null
    pairWithName: string | null
    overallMostRecent: number | null
    placementScore: number
    ratingScore: number | null
    seasonsPlayedCount: number
    captainDivisionId: number | null
    captainDivisionName: string | null
    isCaptain: boolean
    // Week-3-only inputs; optional in the base so shared unit building can
    // read them uniformly (absent ≡ null/0 for week 2).
    week2DivisionId?: number | null
    consecutiveSeasonsInTopDiv?: number
    /**
     * Tryout timeslot request: 1-based slot numbers the player can attend
     * (null/absent = unrestricted). Slot = ceil(teamNumber / 2).
     */
    availableSlots?: number[] | null
    slotRequestComment?: string | null
}

export interface Week2Candidate extends PreseasonCandidate {
    oldId: number | null
    lastDivisionName: string | null
}

export interface Week3Candidate extends PreseasonCandidate {
    week2DivisionId: number | null
    consecutiveSeasonsInTopDiv: number
    forcedMoveDirection: "up" | "down" | null
    recommendationUpCount: number
    recommendationDownCount: number
}

export type PlacedPlayer<C extends PreseasonCandidate> = C & {
    entryId: string
    sourceUserId: string
    isDuplicateEntry: boolean
}

export interface PlacementUnit<C extends PreseasonCandidate> {
    id: string
    players: C[]
    maleCount: number
    nonMaleCount: number
    size: number
    averageScore: number
    hasCaptain: boolean
    isMutualPair: boolean
    captainDivisionId: number | null
    preferredWeek2DivisionId: number | null
}

export interface DivisionPlacement<C extends PreseasonCandidate> {
    division: PreseasonDivision
    units: PlacementUnit<C>[]
    maleCount: number
    nonMaleCount: number
    size: number
    targetSize: number
    targetMale: number
    targetNonMale: number
}

export type PlacementReason =
    | "captain_locked"
    | "mutual_pair_locked"
    | "score_cascade"
    | "tryout2_same_division"
    | "forced_move_up"
    | "forced_move_down"
    | "score_based"

export interface DivisionPlacementResult<C extends PreseasonCandidate> {
    placement: Map<number, DivisionPlacement<C>>
    reasonByUser: Map<string, PlacementReason>
    lockedUserIds: Set<string>
}

export interface SavedAssignment {
    userId: string
    divisionId: number
    teamNumber: number
    isCaptain: boolean
}

export interface ExcludedPlayer {
    userId: string
    oldId: number | null
    firstName: string
    lastName: string
    preferredName: string | null
}
