// Resolves the tryout slot availability the placement engine sees for a
// candidate. Client-safe (pure).

import { COACH_OBSERVATION_SLOT } from "./config"
import type { PreseasonCandidate } from "./types"

/**
 * Coaches are steered to the late slot so they can watch their coaches
 * division; that rule wins over any slot request they submitted. Everyone
 * else gets their request (null = unrestricted).
 */
export function resolveAvailableSlots(
    candidate: Pick<PreseasonCandidate, "isCoach">,
    slotRequest: { availableSlots: number[] } | null | undefined
): number[] | null {
    if (candidate.isCoach) {
        return [COACH_OBSERVATION_SLOT]
    }
    return slotRequest?.availableSlots ?? null
}
