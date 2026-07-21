/**
 * Sets-per-match format for tournament play, configured separately for pool
 * play and playoffs. Two modes:
 *
 *  - `exact`   — teams play all N sets; every set counts. The match is complete
 *                once N sets are entered. The winner is whichever side won more
 *                sets, or nobody on a tie (e.g. 1-1 in an exact-2 match).
 *  - `best_of` — first side to a majority (⌈N/2⌉) of set wins takes the match;
 *                remaining sets need not be played. Always decisive (N must be
 *                odd for a clean majority).
 *
 * Pure and DB-free so it can be unit-tested and shared by the winner-computation
 * path (which gates playoff bracket progression) and the pool-standings path.
 */

export type SetsMode = "exact" | "best_of"

export interface SetsFormat {
    mode: SetsMode
    count: number
}

/** Set-win tally for a single match, counted over the entered (scored) sets. */
export interface SetTally {
    homeWins: number
    awayWins: number
    /** Number of sets with a score on both sides. */
    entered: number
}

/**
 * Tally set wins from parallel home/away set-score arrays. A set counts only
 * when both sides have a score; a drawn set (equal scores) counts for neither.
 */
export function tallySetWins(
    homeScores: Array<number | null>,
    awayScores: Array<number | null>
): SetTally {
    let homeWins = 0
    let awayWins = 0
    let entered = 0
    const len = Math.min(homeScores.length, awayScores.length)
    for (let i = 0; i < len; i++) {
        const h = homeScores[i]
        const a = awayScores[i]
        if (h === null || a === null) continue
        entered++
        if (h > a) homeWins++
        else if (a > h) awayWins++
    }
    return { homeWins, awayWins, entered }
}

/** Set wins needed to clinch a best-of-N match. */
function majority(count: number): number {
    return Math.floor(count / 2) + 1
}

/**
 * Whether a match played under `format` is complete given its set tally.
 *  - exact:   all N sets have been entered.
 *  - best_of: a side has reached the clinching majority of set wins.
 */
export function isMatchFinal(format: SetsFormat, tally: SetTally): boolean {
    if (format.mode === "best_of") {
        const need = majority(format.count)
        return tally.homeWins >= need || tally.awayWins >= need
    }
    return tally.entered >= format.count
}

/**
 * The winning side of a completed match, or null when undecided (not yet final,
 * or a tie in an exact match). Returns "home" or "away".
 */
export function matchWinnerSide(
    format: SetsFormat,
    tally: SetTally
): "home" | "away" | null {
    if (format.mode === "best_of") {
        const need = majority(format.count)
        if (tally.homeWins >= need) return "home"
        if (tally.awayWins >= need) return "away"
        return null
    }
    if (tally.entered < format.count) return null
    if (tally.homeWins > tally.awayWins) return "home"
    if (tally.awayWins > tally.homeWins) return "away"
    return null
}

/**
 * A format is decisive when it can never end in a tie — required for playoffs,
 * where an undecided match would stall bracket progression. `best_of` is always
 * decisive; `exact` is decisive only with an odd set count.
 */
export function isDecisiveFormat(format: SetsFormat): boolean {
    return format.mode === "best_of" || format.count % 2 === 1
}

/**
 * Validate a format. `count` must be 1-3 (bounded by the three physical set
 * columns); `best_of` requires an odd count; when `requireDecisive` is set
 * (playoffs) the format must guarantee a winner.
 */
export function isValidSetsFormat(
    format: SetsFormat,
    options: { requireDecisive?: boolean } = {}
): boolean {
    if (!Number.isInteger(format.count)) return false
    if (format.count < 1 || format.count > 3) return false
    if (format.mode !== "exact" && format.mode !== "best_of") return false
    if (format.mode === "best_of" && format.count % 2 === 0) return false
    if (options.requireDecisive && !isDecisiveFormat(format)) return false
    return true
}

/** Human-readable label, e.g. "Best of 3" or "2 sets". */
export function describeSetsFormat(format: SetsFormat): string {
    if (format.mode === "best_of") return `Best of ${format.count}`
    return format.count === 1 ? "1 set" : `${format.count} sets`
}
