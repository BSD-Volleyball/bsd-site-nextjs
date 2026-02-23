export type Week1PriorityGroup =
    | "new_users"
    | "week1_long_gap"
    | "week1_missing_tryout"
    | "week1_dropped_division"
    | "week1_paired_with_higher"
    | "week1_bubble_players"
    | "week1_other"

export interface Week1Candidate {
    userId: string
    oldId: number | null
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    playFirstWeek: boolean
    pairUserId: string | null
    group: Week1PriorityGroup
    groupLabel: string
    overallMostRecent: number | null
    placementScore: number
    seasonsPlayedCount: number
    lastDraftSeasonId: number | null
    lastDraftSeasonLabel: string | null
    lastDraftDivisionName: string | null
    previousDraftSeasonLabel: string | null
    previousDraftDivisionName: string | null
    pairWithName: string | null
}

export interface Week1GroupSummary {
    key: Week1PriorityGroup
    label: string
    colorClass: string
    count: number
}

export interface Week1RosterAssignment {
    userId: string
    sessionNumber: 1 | 2 | 3
    courtNumber: 1 | 2 | 3 | 4
}

export const GROUP_ORDER: Week1PriorityGroup[] = [
    "new_users",
    "week1_long_gap",
    "week1_missing_tryout",
    "week1_dropped_division",
    "week1_paired_with_higher",
    "week1_bubble_players",
    "week1_other"
]

export const GROUP_LABELS: Record<Week1PriorityGroup, string> = {
    new_users: "1) New User",
    week1_long_gap: "2) Hasn't played in a while",
    week1_missing_tryout: "3) Missing other tryout",
    week1_dropped_division: "4) Dropped divsion",
    week1_paired_with_higher: "5) Paired with higher group",
    week1_bubble_players: "6) Bubble players",
    week1_other: "7) Asked for week 1"
}

export const GROUP_COLORS: Record<Week1PriorityGroup, string> = {
    new_users:
        "bg-emerald-50 border-emerald-300 text-emerald-950 dark:bg-emerald-950/45 dark:border-emerald-800 dark:text-emerald-100",
    week1_long_gap:
        "bg-sky-50 border-sky-300 text-sky-950 dark:bg-sky-950/45 dark:border-sky-800 dark:text-sky-100",
    week1_missing_tryout:
        "bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-950/45 dark:border-amber-800 dark:text-amber-100",
    week1_dropped_division:
        "bg-violet-50 border-violet-300 text-violet-950 dark:bg-violet-950/45 dark:border-violet-800 dark:text-violet-100",
    week1_paired_with_higher:
        "bg-rose-50 border-rose-300 text-rose-950 dark:bg-rose-950/45 dark:border-rose-800 dark:text-rose-100",
    week1_bubble_players:
        "bg-cyan-50 border-cyan-300 text-cyan-950 dark:bg-cyan-950/45 dark:border-cyan-800 dark:text-cyan-100",
    week1_other:
        "bg-slate-50 border-slate-300 text-slate-900 dark:bg-slate-900/60 dark:border-slate-700 dark:text-slate-100"
}
