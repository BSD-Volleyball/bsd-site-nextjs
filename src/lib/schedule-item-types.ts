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

/**
 * A tentative hold for a season night the person is expected to play but has
 * no concrete assignment for yet: every tryout, regular-season and playoff
 * night gets one as soon as the person has a signup, and each is suppressed
 * (in schedule-items) once a real item resolves the night, the person marks
 * themselves unavailable, or a posted roster/draft excludes them.
 */
export interface EventPlaceholder {
    userId: string
    eventId: number
    date: string
    eventType: "tryout" | "regular_season" | "playoff"
    /** Tryout N / Week N / Playoff Week N (1-based). */
    ordinal: number
    /** "HH:mm", already narrowed as far as current knowledge allows. */
    startTime: string
    endTime: string
    /** null until the person is on a drafted team. */
    divisionId: number | null
    divisionName: string | null
    label: string | null
    /** 0 = full-night block, 1 = division-narrowed. Drives ICS SEQUENCE. */
    stage: 0 | 1
}

export interface UserScheduleBundle {
    items: ScheduleItem[]
    placeholders: EventPlaceholder[]
    /** The requested userIds that exist. */
    people: Map<string, SchedulePerson>
    seasonLabel: string
    seasonYear: number | null
}

export const EMPTY_SCHEDULE_BUNDLE: UserScheduleBundle = {
    items: [],
    placeholders: [],
    people: new Map(),
    seasonLabel: "",
    seasonYear: null
}
