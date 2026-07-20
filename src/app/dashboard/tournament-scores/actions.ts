"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    tournamentMatches,
    tournamentPools,
    tournamentRoster,
    tournamentTeams
} from "@/database/schema"
import { and, asc, eq } from "drizzle-orm"
import {
    fail,
    ok,
    requireSession,
    requirePositiveInt,
    withAction,
    type ActionResult
} from "@/lib/action-helpers"
import { getTournamentConfig } from "@/lib/tournament-config"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { progressTournamentMatch } from "@/lib/tournament-brackets"
import { logAuditEntry } from "@/lib/audit-log"
import {
    buildTournamentScheduleView,
    type TournamentScheduleView
} from "@/lib/tournament-schedule"

export type {
    ScheduleTeam,
    ScheduleMatch,
    SchedulePool,
    ScheduleBracketGroup,
    ScheduleDivision,
    TournamentScheduleView
} from "@/lib/tournament-schedule"

/**
 * Matches the current viewer may enter scores for, shaped into the same
 * division → pools + bracket-groups structure the read-only schedule view uses.
 * Admins/directors see every playable match; other users see only matches whose
 * work team they are rostered on. Returns null when there is no active tournament.
 */
export const getScoreEntryRows = withAction(
    async (): Promise<ActionResult<TournamentScheduleView | null>> => {
        const session = await requireSession()
        const config = await getTournamentConfig()
        if (!config) return ok(null)

        const isAdmin = await isAdminOrDirectorBySession()

        // Identify which teams the user is on for this tournament (any team).
        const myTeamRows = await db
            .select({ teamId: tournamentRoster.team_id })
            .from(tournamentRoster)
            .where(
                and(
                    eq(tournamentRoster.tournament_id, config.tournamentId),
                    eq(tournamentRoster.user_id, session.user.id)
                )
            )
        const myTeamIds = new Set(myTeamRows.map((r) => r.teamId))
        const myTeamId = myTeamRows[0]?.teamId ?? null

        const [matches, teams, pools] = await Promise.all([
            db
                .select()
                .from(tournamentMatches)
                .where(
                    eq(tournamentMatches.tournament_id, config.tournamentId)
                ),
            db
                .select({ id: tournamentTeams.id, name: tournamentTeams.name })
                .from(tournamentTeams)
                .where(eq(tournamentTeams.tournament_id, config.tournamentId)),
            db
                .select()
                .from(tournamentPools)
                .where(eq(tournamentPools.tournament_id, config.tournamentId))
                .orderBy(asc(tournamentPools.name))
        ])

        // Only matches with both teams assigned can actually be scored.
        const playable = matches.filter(
            (m) => m.home_team_id !== null && m.away_team_id !== null
        )

        // Authorization filter: admin sees all; otherwise only matches where
        // work_team_id is one of the user's teams.
        const visible = isAdmin
            ? playable
            : playable.filter(
                  (m) =>
                      m.work_team_id !== null && myTeamIds.has(m.work_team_id)
              )

        return ok(
            buildTournamentScheduleView({
                tournamentName: config.name,
                eliminationFormat: config.eliminationFormat,
                myTeamId,
                divisions: config.divisions,
                matches: visible,
                teams,
                pools
            })
        )
    }
)

export interface ScorePayload {
    homeSet1: number | null
    awaySet1: number | null
    homeSet2: number | null
    awaySet2: number | null
    homeSet3: number | null
    awaySet3: number | null
}

function computeWinner(
    payload: ScorePayload,
    homeTeamId: number,
    awayTeamId: number
): number | null {
    function setWinner(h: number | null, a: number | null): number | null {
        if (h === null || a === null) return null
        if (h === a) return null
        return h > a ? homeTeamId : awayTeamId
    }
    const setWinners = [
        setWinner(payload.homeSet1, payload.awaySet1),
        setWinner(payload.homeSet2, payload.awaySet2),
        setWinner(payload.homeSet3, payload.awaySet3)
    ].filter((w): w is number => w !== null)
    if (setWinners.length < 2) return null
    const homeSets = setWinners.filter((w) => w === homeTeamId).length
    const awaySets = setWinners.filter((w) => w === awayTeamId).length
    if (homeSets >= 2) return homeTeamId
    if (awaySets >= 2) return awayTeamId
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

        const winner = computeWinner(
            payload,
            match.home_team_id,
            match.away_team_id
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
        revalidatePath("/dashboard/tournament-bracket")
        return ok()
    }
)
