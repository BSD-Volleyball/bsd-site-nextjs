import "server-only"

import { db } from "@/database/db"
import { userUnavailability } from "@/database/schema"
import { and, eq, inArray } from "drizzle-orm"
import { fetchRatingBasedScores } from "@/lib/player-score"

/**
 * Shared helpers for the week 1-3 roster builder/editor pages
 * (create-week-* and edit-week-* dashboard actions).
 */

/**
 * Returns the subset of the given signup ids that are marked unavailable for
 * the given season event (tryout night). Returns an empty set when no signup
 * ids are provided.
 */
export async function getUnavailableSignupIdsForEvent(
    eventId: number,
    signupIds: number[]
): Promise<Set<number>> {
    const unavailableSignupIds = new Set<number>()
    if (signupIds.length > 0) {
        const unavailRows = await db
            .select({
                signupId: userUnavailability.signup_id
            })
            .from(userUnavailability)
            .where(
                and(
                    inArray(userUnavailability.signup_id, signupIds),
                    eq(userUnavailability.event_id, eventId)
                )
            )
        for (const row of unavailRows) {
            unavailableSignupIds.add(row.signupId!)
        }
    }
    return unavailableSignupIds
}

/**
 * Rating-based placement scores for the subset of userIds that are returning
 * players (i.e. have prior draft history, per the supplied predicate).
 * Returns an empty map when no returning players are found.
 */
export async function fetchRatingScoresForReturningPlayers(
    userIds: string[],
    isReturning: (userId: string) => boolean,
    seasonId: number
): Promise<Map<string, number>> {
    const existingPlayerIds = userIds.filter(isReturning)
    if (existingPlayerIds.length === 0) {
        return new Map<string, number>()
    }
    return fetchRatingBasedScores(existingPlayerIds, seasonId)
}
