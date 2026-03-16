export interface Week3Division {
    id: number
    name: string
    level: number
    index: number
    teamCount: number
    isLast: boolean
    usesCoaches: boolean
}

export interface Week3Candidate {
    userId: string
    firstName: string
    consecutiveSeasonsInTopDiv: number
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
    week2DivisionId: number | null
    forcedMoveDirection: "up" | "down" | null
    recommendationUpCount: number
    recommendationDownCount: number
}

export interface Week3SavedAssignment {
    userId: string
    divisionId: number
    teamNumber: number
    isCaptain: boolean
}

export interface Week3ExcludedPlayer {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
}
