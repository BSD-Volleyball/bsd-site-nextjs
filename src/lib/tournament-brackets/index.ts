import "server-only"

import { db } from "@/database/db"
import {
    tournamentDivisions,
    tournamentMatches,
    tournamentPools,
    tournaments
} from "@/database/schema"
import { and, asc, eq } from "drizzle-orm"
import {
    getPoolStandings,
    type PoolStandingRow
} from "@/lib/tournament-standings"

export interface SeedResult {
    status: boolean
    divisionsSeeded: number
    message: string
}

interface SeededTeam {
    teamId: number
    poolName: string
    poolRank: number
}

/**
 * Generates the bracket structure for a tournament.
 * Per-division: take top N teams from each pool (per division config),
 * order them by pool rank then pool name, and build either a single- or
 * double-elimination bracket of matches into tournament_matches.
 *
 * For a power-of-two count: simple seeded bracket (1 vs N, 2 vs N-1, etc.).
 * For non-power-of-two: top seeds get byes in round 1.
 *
 * Double elimination adds a losers bracket and a grand final, all materialized
 * up-front with home/away populated only where pre-determined (seeded round 1).
 * Later rounds get their teams populated by progression.ts as scores are saved.
 */
export async function seedTournamentBracket(
    tournamentId: number
): Promise<SeedResult> {
    const [t] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId))
        .limit(1)
    if (!t) {
        return {
            status: false,
            divisionsSeeded: 0,
            message: "Tournament not found."
        }
    }

    const eliminationFormat = t.elimination_format as "single" | "double"

    // Don't double-seed.
    const [existing] = await db
        .select({ id: tournamentMatches.id })
        .from(tournamentMatches)
        .where(
            and(
                eq(tournamentMatches.tournament_id, tournamentId),
                eq(tournamentMatches.bracket, "winners")
            )
        )
        .limit(1)
    if (existing) {
        return {
            status: true,
            divisionsSeeded: 0,
            message: "Bracket already seeded."
        }
    }

    const divisions = await db
        .select()
        .from(tournamentDivisions)
        .where(eq(tournamentDivisions.tournament_id, tournamentId))
        .orderBy(asc(tournamentDivisions.sort_order))

    let divisionsSeeded = 0
    for (const division of divisions) {
        const pools = await db
            .select()
            .from(tournamentPools)
            .where(eq(tournamentPools.division_id, division.id))
            .orderBy(asc(tournamentPools.sort_order))

        const seeded: SeededTeam[] = []
        for (const pool of pools) {
            const standings = await getPoolStandings(pool.id)
            const take = Math.min(
                division.teams_advancing_per_pool,
                standings.length
            )
            for (let i = 0; i < take; i++) {
                seeded.push({
                    teamId: standings[i].teamId,
                    poolName: pool.name,
                    poolRank: i + 1
                })
            }
        }

        if (seeded.length < 2) continue

        // Order: best pool-rank first, then alphabetical pool name as tiebreak.
        seeded.sort((a, b) => {
            if (a.poolRank !== b.poolRank) return a.poolRank - b.poolRank
            return a.poolName.localeCompare(b.poolName)
        })

        if (eliminationFormat === "single") {
            await seedSingleElim(tournamentId, division.id, seeded)
        } else {
            await seedDoubleElim(tournamentId, division.id, seeded)
        }
        divisionsSeeded++
    }

    return {
        status: true,
        divisionsSeeded,
        message: `Seeded ${divisionsSeeded} division(s).`
    }
}

function nextPowerOfTwo(n: number): number {
    let p = 1
    while (p < n) p *= 2
    return p
}

/**
 * Standard seeded single-elim. With byes for non-power-of-two counts: top
 * seeds advance to round 2 automatically; remaining seeds fill round 1.
 */
async function seedSingleElim(
    tournamentId: number,
    divisionId: number,
    seeds: SeededTeam[]
): Promise<void> {
    const bracketSize = nextPowerOfTwo(seeds.length)
    const byeCount = bracketSize - seeds.length
    const round1Pairings = buildSeededPairings(bracketSize)

    // Map seed index (1-based) → teamId, with byes represented as null.
    const seedToTeam = new Map<number, number | null>()
    for (let i = 0; i < bracketSize; i++) {
        seedToTeam.set(i + 1, i < seeds.length ? seeds[i].teamId : null)
    }

    const round1: Array<{
        slot: number
        homeTeamId: number | null
        awayTeamId: number | null
    }> = round1Pairings.map((pair, idx) => ({
        slot: idx + 1,
        homeTeamId: seedToTeam.get(pair[0]) ?? null,
        awayTeamId: seedToTeam.get(pair[1]) ?? null
    }))

    const totalRounds = Math.log2(bracketSize)

    // Insert round 1 — skip slots that are bye-vs-bye (shouldn't happen).
    for (const m of round1) {
        await db.insert(tournamentMatches).values({
            tournament_id: tournamentId,
            division_id: divisionId,
            bracket: "winners",
            bracket_round: 1,
            bracket_slot: m.slot,
            home_team_id: m.homeTeamId,
            away_team_id: m.awayTeamId,
            // Auto-resolve bye: the non-null team wins this slot. We pre-populate
            // winner so progression code routes them into round 2 cleanly.
            winner_team_id:
                m.homeTeamId !== null && m.awayTeamId === null
                    ? m.homeTeamId
                    : m.awayTeamId !== null && m.homeTeamId === null
                      ? m.awayTeamId
                      : null
        })
    }

    // Insert later rounds as empty placeholders.
    for (let round = 2; round <= totalRounds; round++) {
        const slots = bracketSize / 2 ** round
        for (let slot = 1; slot <= slots; slot++) {
            await db.insert(tournamentMatches).values({
                tournament_id: tournamentId,
                division_id: divisionId,
                bracket: round === totalRounds ? "final" : "winners",
                bracket_round: round,
                bracket_slot: slot
            })
        }
    }

    void byeCount
}

/**
 * Double elimination: winners bracket as above, plus a parallel losers bracket
 * that takes losers from each winners-bracket round, and a grand final between
 * the winners-bracket champion and losers-bracket champion.
 *
 * Slot/round numbering for losers bracket: each winners-round N produces
 * losers that enter losers-round (2N-2) or (2N-1) depending on the round
 * (standard double-elim bracket structure). We materialize placeholders for
 * all rounds — progression.ts populates teams as matches finish.
 */
async function seedDoubleElim(
    tournamentId: number,
    divisionId: number,
    seeds: SeededTeam[]
): Promise<void> {
    // Reuse single-elim for the winners side.
    await seedSingleElim(tournamentId, divisionId, seeds)

    // Convert the previously-inserted final to 'winners' so the bracket-only
    // logic stays uniform; the grand final below is the true 'final'.
    const bracketSize = nextPowerOfTwo(seeds.length)
    const winnersFinalRound = Math.log2(bracketSize)
    await db
        .update(tournamentMatches)
        .set({ bracket: "winners" })
        .where(
            and(
                eq(tournamentMatches.tournament_id, tournamentId),
                eq(tournamentMatches.division_id, divisionId),
                eq(tournamentMatches.bracket, "final"),
                eq(tournamentMatches.bracket_round, winnersFinalRound)
            )
        )

    // Losers bracket: 2*(winnersRounds) - 1 total losers rounds for a clean
    // power-of-two bracket. For non-power-of-two we still allocate that many
    // and let progression handle empties.
    const winnersRounds = Math.log2(bracketSize)
    const losersRounds = Math.max(1, 2 * winnersRounds - 1)

    let slotsThisRound = bracketSize / 4 // L1 takes losers from W1
    if (slotsThisRound < 1) slotsThisRound = 1
    for (let lr = 1; lr <= losersRounds; lr++) {
        for (let slot = 1; slot <= slotsThisRound; slot++) {
            await db.insert(tournamentMatches).values({
                tournament_id: tournamentId,
                division_id: divisionId,
                bracket: "losers",
                bracket_round: lr,
                bracket_slot: slot
            })
        }
        // Each pair of losers-bracket rounds halves the slot count (LR odd
        // takes a new wave of losers, LR even consolidates).
        if (lr % 2 === 0 && slotsThisRound > 1) {
            slotsThisRound = Math.max(1, slotsThisRound / 2)
        }
    }

    // Grand final.
    await db.insert(tournamentMatches).values({
        tournament_id: tournamentId,
        division_id: divisionId,
        bracket: "final",
        bracket_round: 1,
        bracket_slot: 1
    })
}

/**
 * Standard seeded bracket pairings for a power-of-two bracket.
 * Round 1: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15 for 16-team.
 */
function buildSeededPairings(bracketSize: number): Array<[number, number]> {
    // Recursive: at each split, place the highest seed against the lowest.
    let order: number[] = [1, 2]
    while (order.length < bracketSize) {
        const next: number[] = []
        const sum = order.length * 2 + 1
        for (const s of order) {
            next.push(s)
            next.push(sum - s)
        }
        order = next
    }
    const pairings: Array<[number, number]> = []
    for (let i = 0; i < order.length; i += 2) {
        pairings.push([order[i], order[i + 1]])
    }
    return pairings
}

// Re-export progression for callers.
export { progressTournamentMatch } from "./progression"
export type { PoolStandingRow }
