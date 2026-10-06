"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { tournamentMatches, tournamentRoster } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import {
    fail,
    ok,
    requireSession,
    requirePositiveInt,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import { getTournamentConfig } from "@/lib/tournament-config"
import { isAdminOrDirectorBySession } from "@/next/session"
import { progressTournamentMatch } from "@/lib/tournament-brackets"
import { logAuditEntry } from "@/lib/audit-log"
import {
    matchWinnerSide,
    tallySetWins,
    type SetsFormat
} from "@/lib/tournament-sets"

export type {
    ScheduleTeam,
    ScheduleMatch,
    SchedulePool,
    ScheduleBracketGroup,
    ScheduleDivision,
    TournamentScheduleView
} from "@/lib/tournament-schedule"

export interface ScorePayload {
    homeSet1: number | null
    awaySet1: number | null
    homeSet2: number | null
    awaySet2: number | null
    homeSet3: number | null
    awaySet3: number | null
}

// Resolve the winning team for a match under the given sets format. Delegates
// the semantics to tournament-sets so pool play and playoffs (and each mode)
// stay consistent with the standings and the score-entry UI.
function computeWinner(
    payload: ScorePayload,
    homeTeamId: number,
    awayTeamId: number,
    format: SetsFormat
): number | null {
    const tally = tallySetWins(
        [payload.homeSet1, payload.homeSet2, payload.homeSet3],
        [payload.awaySet1, payload.awaySet2, payload.awaySet3]
    )
    const side = matchWinnerSide(format, tally)
    if (side === "home") return homeTeamId
    if (side === "away") return awayTeamId
    return null
}

export const saveTournamentMatchScore = withAction(
    async (
        matchId: number,
        payload: ScorePayload
    ): Promise<ActionResult<void>> => {
        const session = await requireSession()
        const id = requirePositiveInt(matchId, "match ID")

        const [match] = await db
            .select()
            .from(tournamentMatches)
            .where(eq(tournamentMatches.id, id))
            .limit(1)
        if (!match) return fail("Match not found.")

        const isAdmin = await isAdminOrDirectorBySession()
        if (!isAdmin) {
            if (match.work_team_id === null) {
                return fail("No work team assigned to this match.")
            }
            const [onWorkTeam] = await db
                .select({ id: tournamentRoster.id })
                .from(tournamentRoster)
                .where(
                    and(
                        eq(tournamentRoster.team_id, match.work_team_id),
                        eq(tournamentRoster.user_id, session.user.id)
                    )
                )
                .limit(1)
            if (!onWorkTeam) {
                return fail("You are not on the work team for this match.")
            }
        }

        if (match.home_team_id === null || match.away_team_id === null) {
            return fail("Match teams not assigned yet.")
        }

        // Winner is computed under the tournament's configured sets format for
        // this match's phase (pool play vs. playoffs).
        const config = await getTournamentConfig()
        const fallback: SetsFormat = { mode: "best_of", count: 3 }
        const format =
            match.bracket === "pool"
                ? (config?.poolSets ?? fallback)
                : (config?.playoffSets ?? fallback)

        const winner = computeWinner(
            payload,
            match.home_team_id,
            match.away_team_id,
            format
        )

        await db
            .update(tournamentMatches)
            .set({
                home_set1_score: payload.homeSet1,
                away_set1_score: payload.awaySet1,
                home_set2_score: payload.homeSet2,
                away_set2_score: payload.awaySet2,
                home_set3_score: payload.homeSet3,
                away_set3_score: payload.awaySet3,
                winner_team_id: winner
            })
            .where(eq(tournamentMatches.id, id))

        if (winner !== null) {
            await progressTournamentMatch(id)
        }

        await logAuditEntry({
            userId: session.user.id,
            action: "save_tournament_score",
            entityType: "tournament_match",
            entityId: id,
            summary: `Saved score for match ${id} (winner ${winner ?? "—"})`
        })

        revalidatePath("/dashboard/tournament-scores")
        revalidatePath("/dashboard/tournament-schedule-view")
        return ok()
    }
)
