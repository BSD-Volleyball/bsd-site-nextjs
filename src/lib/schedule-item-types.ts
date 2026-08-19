/**
 * schedule-item-types.ts — shapes returned by getScheduleForUsers()
 * (src/lib/schedule-items.ts). Kept free of server-only imports so the pure
 * calendar formatter and unit tests can use them.
 */

export interface SchedulePerson {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
}

interface ScheduleItemBase {
    userId: string
    /** YYYY-MM-DD. Items whose date cannot be resolved are dropped. */
    date: string
    /** DB time "HH:mm[:ss]"; null = TBD (consumers default to 19:00). */
    startTime: string | null
    /** "HH:mm[:ss]" when a natural end exists; null = kind default (90 min). */
    endTime: string | null
    court: number | null
}

export type MatchScheduleItem = ScheduleItemBase & {
    kind: "match"
    matchId: number
    role: "play" | "work"
    playoff: boolean
    week: number
    divisionId: number
    divisionName: string
    /** This person's team in the match (or the work team). */
    teamId: number
    homeTeamId: number | null
    awayTeamId: number | null
    homeName: string
    awayName: string
    /** Set for one-off match_substitutions pickups. */
    subbingFor: SchedulePerson | null
}

export type RefScheduleItem = ScheduleItemBase & {
    kind: "ref"
    matchId: number
    playoff: boolean
    divisionName: string
    homeName: string
    awayName: string
}

export type TryoutScheduleItem = ScheduleItemBase & {
    kind: "tryout"
    eventId: number
    tryoutNumber: number
    session: number
    sublabel: string | null
}

export type VolunteerScheduleItem = ScheduleItemBase & {
    kind: "volunteer"
    assignmentId: number
    eventId: number
    tryoutNumber: number
    jobName: string
    allNight: boolean
    courtNumber: number | null
}

export type ScheduleItem =
    | MatchScheduleItem
    | RefScheduleItem
    | TryoutScheduleItem
    | VolunteerScheduleItem

export interface PlayoffPlaceholder {
    userId: string
    eventId: number
    date: string
    playoffWeek: number
    /** "HH:mm", already narrowed to the division's regular-season window. */
    startTime: string
    endTime: string
    divisionId: number
    divisionName: string
    label: string | null
}

export interface UserScheduleBundle {
    items: ScheduleItem[]
    playoffPlaceholders: PlayoffPlaceholder[]
    /** The requested userIds that exist. */
    people: Map<string, SchedulePerson>
    seasonLabel: string
    seasonYear: number | null
}

export const EMPTY_SCHEDULE_BUNDLE: UserScheduleBundle = {
    items: [],
    playoffPlaceholders: [],
    people: new Map(),
    seasonLabel: "",
    seasonYear: null
}
