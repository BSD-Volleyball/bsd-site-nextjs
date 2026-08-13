/**
 * friends-display.ts — schedule line formatting shared by the Friends page
 * and the dashboard Friends card. Client-safe: no database imports.
 */

import { formatShortDate } from "@/lib/season-utils"
import type { NextMatch, LastMatchResult } from "@/lib/next-match"
import type { PreseasonAssignment } from "@/lib/preseason-assignment"

export interface FriendScheduleFields {
    nextMatch: NextMatch | null
    preseason?: PreseasonAssignment | null
    signedUpForSeason: boolean
}

/**
 * Has a place to be: an upcoming match, or a tryout slot during the preseason
 * weeks when nobody is drafted yet.
 */
export function isFriendScheduled(friend: FriendScheduleFields): boolean {
    return !!(friend.nextMatch || friend.preseason)
}

/**
 * What a friend is doing next, in priority order: a scheduled match, then a
 * preseason tryout slot, then the two "nothing scheduled" cases — which are
 * different facts and must not be collapsed: a player signed up for the season
 * simply has no assignment yet.
 */
export function friendScheduleLine(
    friend: FriendScheduleFields,
    options: { includeOpponent?: boolean } = {}
): string {
    const { nextMatch, preseason, signedUpForSeason } = friend

    if (nextMatch) {
        const parts = [
            `Week ${nextMatch.week}`,
            `${formatShortDate(nextMatch.date)}${nextMatch.time ? ` ${nextMatch.time}` : ""}`
        ]
        if (nextMatch.court !== null) parts.push(`Court ${nextMatch.court}`)
        if (options.includeOpponent) {
            const division = nextMatch.divisionName
                ? ` (${nextMatch.divisionName})`
                : ""
            parts.push(`vs ${nextMatch.opponentName}${division}`)
        }
        return parts.join(" · ")
    }

    if (preseason) {
        const parts = [`Tryout Week ${preseason.week}`]
        if (preseason.date) parts.push(formatShortDate(preseason.date))
        parts.push(preseason.sessionLabel)
        if (preseason.time) parts.push(preseason.time)
        if (preseason.courtNumber !== null) {
            parts.push(`Court ${preseason.courtNumber}`)
        }
        if (options.includeOpponent && preseason.divisionName) {
            parts.push(`(${preseason.divisionName})`)
        }
        return parts.join(" · ")
    }

    return signedUpForSeason
        ? "Signed up — not scheduled yet"
        : "Not playing this season"
}

export function friendLastResultLine(
    lastResult: LastMatchResult | null
): string {
    if (!lastResult) return "—"
    const letter = lastResult.won ? "W" : "L"
    return `${letter} ${lastResult.myGames}–${lastResult.oppGames} vs ${lastResult.opponentName}`
}
