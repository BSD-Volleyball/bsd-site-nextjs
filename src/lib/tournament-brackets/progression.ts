import "server-only"

import { db } from "@/database/db"
import { tournamentMatches } from "@/database/schema"
import { and, asc, eq, gt, isNull } from "drizzle-orm"

/**
 * After a bracket match's score is saved, push state forward:
 *  - winner advances into next slot of the winners (or grand final) bracket
 *  - in double-elim: loser drops into the appropriate losers-bracket slot
 *  - the loser becomes work_team_id of the next not-yet-completed match on
 *    the same court (matches with no court set are skipped)
 *
 * For pool matches this is a no-op — pool work_team is admin-assigned.
 */
export async function progressTournamentMatch(matchId: number): Promise<void> {
    const [m] = await db
        .select()
        .from(tournamentMatches)
        .where(eq(tournamentMatches.id, matchId))
        .limit(1)
    if (!m || m.bracket === "pool") return
    if (m.winner_team_id === null) return

    const loserTeamId =
        m.winner_team_id === m.home_team_id ? m.away_team_id : m.home_team_id

    // Winners side: advance winner to ceil(slot/2) of next round.
    if (m.bracket === "winners" && m.bracket_round && m.bracket_slot) {
        const nextRound = m.bracket_round + 1
        const nextSlot = Math.ceil(m.bracket_slot / 2)
        const isHome = m.bracket_slot % 2 === 1
        await setNextSlotTeam(
            m.tournament_id,
            m.division_id,
            ["winners", "final"],
            nextRound,
            nextSlot,
            m.winner_team_id,
            isHome
        )
    }

    // Losers side: progress winner within losers bracket.
    if (m.bracket === "losers" && m.bracket_round && m.bracket_slot) {
        const nextRound = m.bracket_round + 1
        // Losers-bracket consolidation halves slot count every other round.
        const nextSlot =
            m.bracket_round % 2 === 0
                ? Math.ceil(m.bracket_slot / 2)
                : m.bracket_slot
        const isHome = m.bracket_slot % 2 === 1
        await setNextSlotTeam(
            m.tournament_id,
            m.division_id,
            ["losers", "final"],
            nextRound,
            nextSlot,
            m.winner_team_id,
            isHome
        )
    }

    // Work team rotation: loser becomes work team of the next not-yet-completed
    // match on the same court.
    if (loserTeamId !== null && m.court !== null) {
        const candidates = await db
            .select({
                id: tournamentMatches.id,
                workTeamId: tournamentMatches.work_team_id,
                winnerTeamId: tournamentMatches.winner_team_id
            })
            .from(tournamentMatches)
            .where(
                and(
                    eq(tournamentMatches.tournament_id, m.tournament_id),
                    eq(tournamentMatches.court, m.court),
                    gt(
                        tournamentMatches.start_time,
                        m.start_time ?? "00:00:00"
                    ),
                    isNull(tournamentMatches.winner_team_id)
                )
            )
            .orderBy(asc(tournamentMatches.start_time))
            .limit(1)
        const next = candidates[0]
        if (next && next.workTeamId === null) {
            await db
                .update(tournamentMatches)
                .set({ work_team_id: loserTeamId })
                .where(eq(tournamentMatches.id, next.id))
        }
    }
}

async function setNextSlotTeam(
    tournamentId: number,
    divisionId: number,
    brackets: string[],
    round: number,
    slot: number,
    teamId: number,
    isHome: boolean
): Promise<void> {
    // Find the candidate match in any of the allowed bracket buckets.
    for (const bracket of brackets) {
        const [match] = await db
            .select({
                id: tournamentMatches.id,
                homeTeamId: tournamentMatches.home_team_id,
                awayTeamId: tournamentMatches.away_team_id
            })
            .from(tournamentMatches)
            .where(
                and(
                    eq(tournamentMatches.tournament_id, tournamentId),
                    eq(tournamentMatches.division_id, divisionId),
                    eq(tournamentMatches.bracket, bracket),
                    eq(tournamentMatches.bracket_round, round),
                    eq(tournamentMatches.bracket_slot, slot)
                )
            )
            .limit(1)
        if (!match) continue
        await db
            .update(tournamentMatches)
            .set(isHome ? { home_team_id: teamId } : { away_team_id: teamId })
            .where(eq(tournamentMatches.id, match.id))
        return
    }
}
