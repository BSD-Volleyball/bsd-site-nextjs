/**
 * Shared types for the player schedule section shown in the player detail
 * pop-ups. Lives outside the "use server" action file and the server-only
 * query lib so the client component can import them.
 */

export interface PlayerScheduleEntry {
    /** Raw "YYYY-MM-DD"; formatted client-side with formatEventDate. */
    date: string
    /** Display-ready time (e.g. "6:30 PM", "All night"); null = TBD. */
    timeLabel: string | null
    court: number | null
    label: string
    sublabel: string | null
}

export interface PlayerScheduleData {
    tryouts: PlayerScheduleEntry[]
    games: PlayerScheduleEntry[]
    reffing: PlayerScheduleEntry[]
    volunteering: PlayerScheduleEntry[]
}

export const EMPTY_PLAYER_SCHEDULE: PlayerScheduleData = {
    tryouts: [],
    games: [],
    reffing: [],
    volunteering: []
}
