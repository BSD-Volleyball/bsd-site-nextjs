import type { SeasonEvent } from "@/lib/season-types"

/** Only the id is needed to test membership in the unavailable set. */
type EventRef = Pick<SeasonEvent, "id">

/** Number of missed dates that triggers the "quite a few dates" warning. */
export const MANY_MISSED_DATES_THRESHOLD = 4

/**
 * True when the player marked every tryout date unavailable. Missing all
 * tryouts makes appropriate team placement very hard.
 */
export function isMissingAllTryouts(
    tryoutEvents: EventRef[],
    unavailableEventIds: Set<number>
): boolean {
    return (
        tryoutEvents.length > 0 &&
        tryoutEvents.every((event) => unavailableEventIds.has(event.id))
    )
}

/** True when the player marked enough dates unavailable to be worth flagging. */
export function isMissingManyDates(unavailableEventIds: Set<number>): boolean {
    return unavailableEventIds.size >= MANY_MISSED_DATES_THRESHOLD
}

/**
 * True when the player marked every playoff date unavailable. Captains asked
 * that we only accept players who plan to play at least one playoff match.
 */
export function isMissingAllPlayoffs(
    playoffEvents: EventRef[],
    unavailableEventIds: Set<number>
): boolean {
    return (
        playoffEvents.length > 0 &&
        playoffEvents.every((event) => unavailableEventIds.has(event.id))
    )
}
