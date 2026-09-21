/**
 * types.ts — shapes shared by the Coverage page, actions, digest email and
 * the pure builders. No server imports: client components import these.
 */

export type CoverageStatus = "green" | "yellow" | "red"

export type CoverageSource = "play" | "work" | "ref" | "coach" | "present"

export interface CoveragePerson {
    userId: string
    name: string
    /**
     * Counts toward the slot's coverage: admins always (unless unavailable);
     * leadership_group members only when manually added present for this
     * slot (a "present" source), also unless unavailable.
     */
    counts: boolean
    /** leadership_group member (not also an admin). */
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
    /**
     * Type of the season's next regular-season or playoff night after this
     * one, or null when this is the last. Drives the "playoffs next week"
     * task lines.
     */
    nextEventType: "regular_season" | "playoff" | null
    /** 1-based within its event type: Week N / Playoffs Week N. */
    ordinal: number
    label: string | null
    matchCount: number
    slots: CoverageSlot[]
    status: CoverageStatus
    reason: string
    orphanedPresence: OrphanedPresence[]
}

/** A member of the presence-picker pool: an admin or a leadership member. */
export interface CoverageAdmin {
    userId: string
    name: string
    isLeadership: boolean
}
