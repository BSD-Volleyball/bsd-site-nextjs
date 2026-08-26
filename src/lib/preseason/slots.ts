// Resolves the tryout slot availability the placement engine sees for a
// candidate. Client-safe (pure).

import { COACH_OBSERVATION_SLOT } from "./config"
import type { PreseasonCandidate } from "./types"

/**
 * Coaches are steered to the late slot so they can watch their coaches
 * division; that rule wins over any slot request they submitted. Everyone
 * else gets their request (null = unrestricted).
 */
/** Time slot a team plays in (teams 1-2 → 1, 3-4 → 2, 5-6 → 3). */
export function getTeamNumberSlot(teamNumber: number) {
    return Math.floor((teamNumber - 1) / 2) + 1
}

export interface SameTimeConflict {
    userId: string
    slot: number
    /** Every team (across divisions) the player holds in that time slot. */
    teams: { divisionName: string; teamNumber: number }[]
}

/**
 * Players holding more than one roster spot in the same time slot — they
 * would be double-booked, since every team in a slot plays at once.
 * Returns userId → conflicts (one entry per over-booked time slot).
 */
export function findSameTimeConflicts(
    assignments: {
        userId: string
        divisionName: string
        teamNumber: number
    }[]
): Map<string, SameTimeConflict[]> {
    const byUserAndSlot = new Map<string, SameTimeConflict>()
    for (const a of assignments) {
        if (!a.userId) {
            continue
        }
        const slot = getTeamNumberSlot(a.teamNumber)
        const key = `${a.userId}:${slot}`
        const entry = byUserAndSlot.get(key) ?? {
            userId: a.userId,
            slot,
            teams: []
        }
        entry.teams.push({
            divisionName: a.divisionName,
            teamNumber: a.teamNumber
        })
        byUserAndSlot.set(key, entry)
    }

    const result = new Map<string, SameTimeConflict[]>()
    for (const entry of byUserAndSlot.values()) {
        if (entry.teams.length < 2) {
            continue
        }
        result.set(entry.userId, [...(result.get(entry.userId) ?? []), entry])
    }
    return result
}

/**
 * Whether a placement in `slot` honors the player's tryout slot request.
 * No request (null/empty) means unrestricted.
 */
export function slotFitsRequest(
    slot: number,
    requestedSlots: number[] | null | undefined
): boolean {
    if (!requestedSlots || requestedSlots.length === 0) {
        return true
    }
    return requestedSlots.includes(slot)
}

/** "7:00 PM, 8:00 PM" from slot numbers + the week's slot labels. */
export function formatSlotList(slots: number[], slotLabels: string[]) {
    return slots.map((n) => slotLabels[n - 1] ?? `Slot ${n}`).join(", ")
}

export function resolveAvailableSlots(
    candidate: Pick<PreseasonCandidate, "isCoach">,
    slotRequest: { availableSlots: number[] } | null | undefined
): number[] | null {
    if (candidate.isCoach) {
        return [COACH_OBSERVATION_SLOT]
    }
    return slotRequest?.availableSlots ?? null
}
