export interface Week2Division {
    id: number
    name: string
    level: number
    index: number
    teamCount: number
    isLast: boolean
}

export interface Week2Candidate {
    userId: string
    oldId: number | null
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    pairUserId: string | null
    pairWithName: string | null
    overallMostRecent: number | null
    placementScore: number
    seasonsPlayedCount: number
    captainDivisionId: number | null
    captainDivisionName: string | null
    isCaptain: boolean
}

export interface Week2SavedAssignment {
    userId: string
    divisionId: number
    teamNumber: number
    isCaptain: boolean
}

export interface Week2ExcludedPlayer {
    userId: string
    oldId: number | null
    firstName: string
    lastName: string
    preferredName: string | null
}
