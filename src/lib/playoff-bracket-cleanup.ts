// Removes the double-elimination "if necessary" final when it turns out not to
// have been necessary.
//
// Seeding a playoff bracket schedules the reset final up front (match 11 of
// SIX_TEAM_PLAYOFF, match 7 of FOUR_TEAM_PLAYOFF) because nobody knows in
// advance whether it will be needed -- it has a time, a court and a work team,
// and teams need to see it. If the winners-bracket team then wins the first
// final, the tournament is over and that slot is never played. Left in place it
// renders as an empty box hanging off the end of the bracket on the history
// page, which reads as a missing result rather than a match that never was.
//
// The distinction this module has to get right: an unplayed reset slot means
// "never needed" ONLY when the first final was won by a team that came into it
// undefeated. If the winners-bracket team LOST the first final, a decider
// genuinely was required, and an empty slot means the score has not been
// entered yet. Pruning that would erase a real match.
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import {
    matchSubstitutions,
    matches,
    playoffMatchesMeta
} from "@/database/schema"
import { isWinnerLoserReset, parseSourceToken } from "@/lib/playoff-sources"

/** One bracket slot: its meta row plus whatever match row is attached. */
export interface BracketSlot {
    metaId: number
    matchNum: number
    homeSource: string | null
    awaySource: string | null
    matchId: number | null
    winner: number | null
    homeTeamId: number | null
    awayTeamId: number | null
    /** True if any score column is set, however partially. */
    hasAnyScore: boolean
}

export interface PrunableReset {
    metaId: number
    matchId: number | null
    matchNum: number
    /** The first final, whose result made this slot moot. */
    decidedByMatchNum: number
    /** Winner of that first final -- the champion. */
    championTeamId: number
}

/**
 * Pick the reset finals in ONE division's bracket that were never played and
 * never could have been. Pure, so the rule is testable without a database.
 */
export function selectPrunableResets(slots: BracketSlot[]): PrunableReset[] {
    if (slots.length === 0) {
        return []
    }

    const byNum = new Map(slots.map((s) => [s.matchNum, s]))
    const maxNum = Math.max(...slots.map((s) => s.matchNum))
    const out: PrunableReset[] = []

    for (const slot of slots) {
        const home = parseSourceToken(slot.homeSource)
        const away = parseSourceToken(slot.awaySource)
        if (!isWinnerLoserReset(home, away)) {
            continue
        }
        // A reset is the last match by construction. Anything else claiming
        // this shape is a bracket we do not understand -- leave it alone.
        if (slot.matchNum !== maxNum) {
            continue
        }
        // It was played. Nothing to remove.
        if (slot.winner !== null || slot.hasAnyScore) {
            continue
        }

        const decidedByMatchNum = home.value
        if (decidedByMatchNum === null) {
            continue
        }
        const first = byNum.get(decidedByMatchNum)
        if (!first || first.winner === null) {
            continue
        }

        // Losses the winner of the first final carried into it. Zero means
        // winning it ended the tournament; anything else means this slot is a
        // required decider whose score is simply missing.
        let losses = 0
        for (const other of slots) {
            if (other.matchNum >= decidedByMatchNum) {
                continue
            }
            if (
                other.winner === null ||
                other.homeTeamId === null ||
                other.awayTeamId === null
            ) {
                continue
            }
            const loser =
                other.winner === other.homeTeamId
                    ? other.awayTeamId
                    : other.homeTeamId
            if (loser === first.winner) {
                losses++
            }
        }
        if (losses !== 0) {
            continue
        }

        out.push({
            metaId: slot.metaId,
            matchId: slot.matchId,
            matchNum: slot.matchNum,
            decidedByMatchNum,
            championTeamId: first.winner
        })
    }

    return out
}

export interface PruneSkip {
    matchId: number
    reason: string
}

export interface PruneResult {
    pruned: PrunableReset[]
    skipped: PruneSkip[]
}

/** Load one season's bracket slots, grouped by division. */
async function loadSlotsByDivision(
    seasonId: number
): Promise<Map<number, BracketSlot[]>> {
    const rows = await db
        .select({
            metaId: playoffMatchesMeta.id,
            division: playoffMatchesMeta.division,
            matchNum: playoffMatchesMeta.match_num,
            homeSource: playoffMatchesMeta.home_source,
            awaySource: playoffMatchesMeta.away_source,
            matchId: playoffMatchesMeta.match_id,
            winner: matches.winner,
            homeTeamId: matches.home_team,
            awayTeamId: matches.away_team,
            homeScore: matches.home_score,
            awayScore: matches.away_score,
            homeSet1: matches.home_set1_score,
            awaySet1: matches.away_set1_score,
            homeSet2: matches.home_set2_score,
            awaySet2: matches.away_set2_score,
            homeSet3: matches.home_set3_score,
            awaySet3: matches.away_set3_score
        })
        .from(playoffMatchesMeta)
        .leftJoin(matches, eq(playoffMatchesMeta.match_id, matches.id))
        .where(eq(playoffMatchesMeta.season, seasonId))

    const byDivision = new Map<number, BracketSlot[]>()
    for (const row of rows) {
        const hasAnyScore = [
            row.homeScore,
            row.awayScore,
            row.homeSet1,
            row.awaySet1,
            row.homeSet2,
            row.awaySet2,
            row.homeSet3,
            row.awaySet3
        ].some((v) => v !== null)

        const slot: BracketSlot = {
            metaId: row.metaId,
            matchNum: row.matchNum,
            homeSource: row.homeSource,
            awaySource: row.awaySource,
            matchId: row.matchId,
            winner: row.winner,
            homeTeamId: row.homeTeamId,
            awayTeamId: row.awayTeamId,
            hasAnyScore
        }
        const arr = byDivision.get(row.division) ?? []
        arr.push(slot)
        byDivision.set(row.division, arr)
    }
    return byDivision
}

/** Report what pruning would remove, without writing anything. */
export async function findUnplayedBracketResets(
    seasonId: number
): Promise<PrunableReset[]> {
    const byDivision = await loadSlotsByDivision(seasonId)
    return [...byDivision.values()].flatMap(selectPrunableResets)
}

/**
 * Delete every never-needed reset final in a season: the meta row so the
 * bracket stops rendering the slot, and the placeholder match row with it.
 *
 * Referee assignments on the placeholder cascade away, which is intended --
 * nobody worked a match that was not played, and ref-compensation counts
 * assignments rather than results.
 */
export async function pruneUnplayedBracketResets(
    seasonId: number
): Promise<PruneResult> {
    const candidates = await findUnplayedBracketResets(seasonId)
    if (candidates.length === 0) {
        return { pruned: [], skipped: [] }
    }

    // match_substitutions is ON DELETE RESTRICT and would abort the whole
    // transaction. A never-played match should have none; if one does, that
    // contradicts "never played", so skip it rather than force it through.
    const matchIds = candidates
        .map((c) => c.matchId)
        .filter((id): id is number => id !== null)
    const blocked = new Set<number>()
    if (matchIds.length > 0) {
        const subs = await db
            .select({ match: matchSubstitutions.match })
            .from(matchSubstitutions)
            .where(inArray(matchSubstitutions.match, matchIds))
        for (const s of subs) {
            blocked.add(s.match)
        }
    }

    const pruned = candidates.filter(
        (c) => c.matchId === null || !blocked.has(c.matchId)
    )
    const skipped: PruneSkip[] = candidates
        .filter((c) => c.matchId !== null && blocked.has(c.matchId))
        .map((c) => ({
            matchId: c.matchId as number,
            reason: "has substitution rows, so it was not an unplayed match"
        }))

    if (pruned.length === 0) {
        return { pruned: [], skipped }
    }

    const prunedMatchIds = pruned
        .map((c) => c.matchId)
        .filter((id): id is number => id !== null)

    await db.transaction(async (tx) => {
        await tx.delete(playoffMatchesMeta).where(
            and(
                eq(playoffMatchesMeta.season, seasonId),
                inArray(
                    playoffMatchesMeta.id,
                    pruned.map((c) => c.metaId)
                )
            )
        )
        if (prunedMatchIds.length > 0) {
            await tx.delete(matches).where(inArray(matches.id, prunedMatchIds))
        }
    })

    return { pruned, skipped }
}
