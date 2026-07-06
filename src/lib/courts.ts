/**
 * Historical court assignments by division name, used when printing tryout
 * paperwork. Falls back to division level/id for divisions not listed.
 */
export const LEGACY_COURT_BY_DIVISION: Record<string, number> = {
    AA: 1,
    A: 2,
    ABA: 3,
    ABB: 4,
    BB: 7,
    BBB: 8
}

/** Weeks 2/3 tryout sessions are derived from the roster's team number. */
export function getSessionNumberFromTeam(teamNumber: number): 1 | 2 | 3 {
    if (teamNumber <= 2) {
        return 1
    }

    if (teamNumber <= 4) {
        return 2
    }

    return 3
}
