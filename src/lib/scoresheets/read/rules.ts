/**
 * rules.ts — which final scores a game could legally have ended on.
 *
 * This is the reader's safety net. A handwriting model asked to read "25" can
 * return "26" or "75"; volleyball cannot. Enumerating the legal endings turns
 * a free-form guess into a choice among a few hundred possibilities, and most
 * misreadings simply are not on the list.
 *
 * The rules themselves are owned by the rules pages and restated for printing
 * in `sheet-config.ts`; this module restates them once more as arithmetic.
 * When a cap changes there, change it here too.
 */

import { gameRules } from "../sheet-config"
import type { SheetEventType } from "../types"

export interface GameConstraint {
    /** Points needed to win outright, before the win-by-two rule. */
    target: number
    /** Highest score either side can reach, or null when uncapped. */
    cap: number | null
    /** Lowest possible score: playoff games start at 4-4. */
    floor: number
}

export interface ScorePair {
    winner: number
    loser: number
}

export function gameConstraint(
    eventType: SheetEventType,
    game: 1 | 2 | 3
): GameConstraint {
    const rule = gameRules(eventType)[game - 1]
    const floor = rule.preStruck

    if (eventType !== "playoff") {
        // Regular season: every game plays to 25 with a 27-point cap.
        return { target: 25, cap: 27, floor }
    }
    // Playoff games 1 and 2 are capped at 30; the decider is not.
    return { target: 25, cap: game === 3 ? null : 30, floor }
}

/**
 * Every legal (winner, loser) pair for a game.
 *
 * Three shapes of ending: won outright at the target with the loser two or
 * more behind; won by exactly two in the extra-points phase; and, when the
 * game is capped, won by a single point at the cap because the cap overrides
 * the win-by-two rule.
 */
export function legalScorePairs(c: GameConstraint): ScorePair[] {
    const pairs: ScorePair[] = []

    // Won at the target without needing extra points.
    for (let loser = c.floor; loser <= c.target - 2; loser++) {
        pairs.push({ winner: c.target, loser })
    }

    // Extra points: win by exactly two.
    const ceiling = c.cap ?? c.target + 20
    for (let winner = c.target + 1; winner <= ceiling; winner++) {
        const loser = winner - 2
        if (loser >= c.floor) pairs.push({ winner, loser })
    }

    // At the cap a single point is enough.
    if (c.cap !== null && c.cap - 1 >= c.floor) {
        pairs.push({ winner: c.cap, loser: c.cap - 1 })
    }

    return pairs
}

/** Every score that could appear in either box, for filtering a reading. */
export function legalValues(c: GameConstraint): number[] {
    const seen = new Set<number>()
    for (const pair of legalScorePairs(c)) {
        seen.add(pair.winner)
        seen.add(pair.loser)
    }
    return [...seen].sort((a, b) => a - b)
}

/** Whether an ordered pair of scores is a possible way for a game to end. */
export function isLegalPair(
    c: GameConstraint,
    home: number,
    away: number
): boolean {
    if (home === away) return false
    const winner = Math.max(home, away)
    const loser = Math.min(home, away)
    return legalScorePairs(c).some(
        (p) => p.winner === winner && p.loser === loser
    )
}
