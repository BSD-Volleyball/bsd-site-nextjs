import type { Week1PriorityGroup } from "./week1-types"

/**
 * Pure week 1 tryout priority rules, shared by the admin Create Week 1 page
 * (which buckets every signup) and the player-facing availability surfaces
 * (which tailor the week 1 callout to the viewer's likely bucket).
 */

/** A player is "hasn't played in a while" once more than this many seasons have passed. */
export const LONG_GAP_SEASONS = 4

export interface Week1DraftSeason {
    seasonId: number
    /** Higher level number = lower division. */
    divisionLevel: number
}

export interface Week1GroupInput {
    hasAnyDraft: boolean
    playFirstWeek: boolean
    missesTryout2Or3: boolean
    mostRecentDraft: Week1DraftSeason | null
    secondMostRecentDraft: Week1DraftSeason | null
    currentSeasonId: number
}

/**
 * First-pass bucket for a signup. Returns null for returning players who
 * are not playing week 1. Buckets 5 (paired with higher) and 6 (bubble) are
 * refinements of `week1_other` that need the whole pool and are applied by
 * the caller.
 */
export function getWeek1PriorityGroup({
    hasAnyDraft,
    playFirstWeek,
    missesTryout2Or3,
    mostRecentDraft,
    secondMostRecentDraft,
    currentSeasonId
}: Week1GroupInput): Week1PriorityGroup | null {
    if (!hasAnyDraft) {
        return "new_users"
    }

    if (!playFirstWeek) {
        return null
    }

    const seasonGap = mostRecentDraft
        ? currentSeasonId - mostRecentDraft.seasonId
        : null

    if (seasonGap !== null && seasonGap > LONG_GAP_SEASONS) {
        return "week1_long_gap"
    }

    if (missesTryout2Or3) {
        return "week1_missing_tryout"
    }

    if (
        mostRecentDraft &&
        secondMostRecentDraft &&
        mostRecentDraft.divisionLevel > secondMostRecentDraft.divisionLevel
    ) {
        return "week1_dropped_division"
    }

    return "week1_other"
}

/**
 * Who the week 1 callout is talking to:
 * - "new": no draft history (bucket 1) — expected to attend
 * - "likely": a returning player who will almost certainly be scheduled
 *   into week 1 (buckets 2-4 and 6) — defaults to attending
 * - "returning": every other returning player — week 1 is opt-in
 *
 * Bucket 5 (paired with a higher bucket) depends on the partner's signup and
 * is not predicted here.
 */
export type Week1Audience = "new" | "likely" | "returning"

export interface Week1AudienceInput {
    hasAnyDraft: boolean
    mostRecentDraft: Week1DraftSeason | null
    secondMostRecentDraft: Week1DraftSeason | null
    currentSeasonId: number
    isBubblePlayer: boolean
    missesTryout2Or3: boolean
}

export function resolveWeek1Audience({
    isBubblePlayer,
    ...input
}: Week1AudienceInput): Week1Audience {
    const group = getWeek1PriorityGroup({ ...input, playFirstWeek: true })
    if (group === "new_users") {
        return "new"
    }
    if (group === "week1_other" || group === null) {
        return isBubblePlayer ? "likely" : "returning"
    }
    return "likely"
}

/**
 * Live refinement for forms: marking tryout 2 or 3 unavailable moves a plain
 * returning player into bucket 3, so the callout should treat them as likely.
 */
export function effectiveWeek1Audience(
    base: Week1Audience,
    missesTryout2Or3: boolean
): Week1Audience {
    return base === "returning" && missesTryout2Or3 ? "likely" : base
}

/** Whether the week 1 tryout starts out marked unavailable for this audience. */
export function defaultWeek1Unavailable(audience: Week1Audience): boolean {
    return audience === "returning"
}
