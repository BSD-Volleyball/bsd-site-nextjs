// Shared shapes for the week 2/3 roster editor. Lives in lib so that
// src/lib/preseason/edit-week-actions.ts never imports from components.

export interface EditWeekPlayer {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    hasPairPick: boolean
    placementScore: number
    ratingScore: number | null
    lastDivisionName: string | null
    seasonsPlayedCount: number
    /**
     * Set when the player holds a roster slot but is no longer eligible for
     * it (opted out of the tryout night, or signup removed). Rendered in red;
     * never offered as a choice for other slots.
     */
    unavailableReason: string | null
    /** Tryout slots (1-3) the player asked to play in; null = no request. */
    requestedSlots: number[] | null
    slotRequestComment: string | null
}

export interface EditWeekSlot {
    id: number
    divisionId: number
    divisionName: string
    teamNumber: number
    userId: string
    isCaptain: boolean
}

export interface EditWeekRosterEntry {
    divisionId: number
    teamNumber: number
    userId: string
    isCaptain: boolean
}

export interface EditWeekAssignment {
    userId: string
    divisionId: number
    divisionName: string
    teamNumber: number
}
