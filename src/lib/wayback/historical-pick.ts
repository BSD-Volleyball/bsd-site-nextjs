/**
 * The synthetic draft position given to players imported from the archives.
 *
 * Historical rosters record who was on a team but never the draft order, so
 * every player in a division gets the SAME position: the first pick of round 4.
 * Uniform values assert no false pick order while placing the player at a
 * neutral mid-draft position.
 *
 * THE PART THAT IS EASY TO GET WRONG
 * `drafts.overall` is not a pick number within a division. It is a league-wide
 * placement score BANDED BY DIVISION LEVEL, 50 wide per level -- AA (level 1)
 * owns 1-50, A owns 51-100, BBB owns 201-250, and so on. `fetchPlayerScores`
 * (src/lib/player-score.ts) reads a bare `overall` as a skill proxy with no
 * division context attached, which only works because the division is encoded
 * in the number itself.
 *
 * The first version of the import omitted the `(level - 1) * 50` term and so
 * filed every historical player into the AA band. It went unnoticed because the
 * offset is zero for AA, so the formula was correct for the one division
 * anybody was likely to spot-check. 2,635 rows had to be repaired
 * (scripts/fix-draft-overall.ts).
 *
 * Mirrors `submitDraft` in src/app/dashboard/draft-division/actions.ts, with
 * positionValue pinned to 1 -- that is what "first pick of the round" means.
 */

export const HISTORICAL_ROUND = 4

/** Width of each division's band in the `overall` number line. */
const BAND = 50

export function historicalOverall(
    divisionLevel: number,
    teamCount: number
): number {
    return (divisionLevel - 1) * BAND + (HISTORICAL_ROUND - 1) * teamCount + 1
}

/**
 * The band a division's picks must fall inside. Used to assert a repair landed
 * where it should.
 */
export function divisionBand(divisionLevel: number): {
    min: number
    max: number
} {
    return {
        min: (divisionLevel - 1) * BAND + 1,
        max: divisionLevel * BAND
    }
}
