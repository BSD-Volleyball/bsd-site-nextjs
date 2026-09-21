/**
 * types.ts — shapes shared by the score-sheet loader, the pure layout module
 * and the pdf renderer. No server imports.
 *
 * One `CourtSheet` becomes exactly one printed letter page. A court can host
 * 1-4 matches on a night (regular season: 3 for six-team divisions, 2 for
 * four-team; playoff week 1: up to 4, week 2: 2, week 3: up to 3), and on
 * playoff week 2 a single court hosts two different divisions -- which is why
 * the division lives on the match, not on the sheet.
 */

export type SheetEventType = "regular_season" | "playoff"

export interface SheetTeam {
    /** null when a playoff slot has no winner yet. */
    teamId: number | null
    /** Team name, or a bracket label like "Winner of M1" / "Seed 4". */
    name: string
    isPlaceholder: boolean
    /** Captain and co-captain display names; 0-2 entries. */
    captains: string[]
}

export interface SheetMatch {
    matchId: number
    /** 1-based position among this court's matches that night. */
    orderOnCourt: number
    divisionName: string
    /** "HH:MM:SS", or null when the match has no scheduled time. */
    time: string | null
    playoff: boolean
    /** Bracket match number (M5), playoffs only. */
    playoffMatchNum: number | null
    bracket: string | null
    home: SheetTeam
    away: SheetTeam
    referee: string | null
    backupReferee: string | null
    /** Playoff work team name or bracket label. */
    workTeam: string | null
}

export interface CourtSheet {
    /** null groups matches that have no court assigned yet. */
    court: number | null
    matches: SheetMatch[]
}

export interface SheetNight {
    /** "YYYY-MM-DD" */
    date: string
    /** "Fall 2026" */
    seasonLabel: string
    /** "F26" */
    seasonCode: string
    eventType: SheetEventType
    /** 1-based week within the event type. */
    ordinal: number
    /** "Week 3 - Mon, Oct 5" */
    nightLabel: string
    courts: CourtSheet[]
}
