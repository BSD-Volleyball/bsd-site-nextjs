export type RosterChangeKind = "added" | "removed" | "changed"

export interface RosterChangeEntry {
    userId: string
    displayName: string
    changeKind: RosterChangeKind
    // Week 1: non-null when applicable
    week1Assignment: { sessionNumber: number; courtNumber: number } | null
    // Weeks 2/3: non-null when applicable (may have multiple slots if playing twice)
    divisionAssignments: Array<{
        divisionId: number
        divisionName: string
        teamNumber: number
    }> | null
}
