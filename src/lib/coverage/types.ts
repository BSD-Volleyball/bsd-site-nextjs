/**
 * types.ts — shapes shared by the Coverage page, actions, digest email and
 * the pure builders. No server imports: client components import these.
 */

export type CoverageStatus = "green" | "yellow" | "red"

export type CoverageSource = "play" | "work" | "ref" | "present"

export interface CoveragePerson {
    userId: string
    name: string
    /** Counts toward the slot's coverage (admin role, not unavailable). */
    counts: boolean
    /** leadership_group member shown for information only. */
    isLeadership: boolean
    /** Has a user_unavailability row for this night. */
    unavailable: boolean
    sources: CoverageSource[]
    /** coverage_presence.id when a manual entry contributes. */
    presenceId: number | null
    note: string | null
}

export interface CoverageSlot {
    /** "HH:MM:SS"; null is the TBD bucket for matches with no time. */
    startTime: string | null
    label: string
    matchCount: number
    people: CoveragePerson[]
}

export interface OrphanedPresence {
    presenceId: number
    userId: string
    name: string
    slotTime: string
    note: string | null
}

export interface CoverageDate {
    date: string
    eventId: number
    eventType: "regular_season" | "playoff"
    /** 1-based within its event type: Week N / Playoffs Week N. */
    ordinal: number
    label: string | null
    matchCount: number
    slots: CoverageSlot[]
    status: CoverageStatus
    reason: string
    orphanedPresence: OrphanedPresence[]
}

export interface CoverageAdmin {
    userId: string
    name: string
}
