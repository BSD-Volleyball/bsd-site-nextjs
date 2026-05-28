"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    tournamentMatches,
    tournamentRoster,
    tournamentTeams
} from "@/database/schema"
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm"
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

export interface ScoreEntryRow {
    matchId: number
    bracket: string
    court: number | null
    startTime: string | null
    homeTeamId: number
    homeTeamName: string
    awayTeamId: number
    awayTeamName: string
    homeSet1: number | null
    awaySet1: number | null
    homeSet2: number | null
    awaySet2: number | null
    homeSet3: number | null
    awaySet3: number | null
    winnerTeamId: number | null
}

export const getScoreEntryRows = withAction(
    async (): Promise<
        ActionResult<{
            tournamentId: number
            tournamentName: string
            rows: ScoreEntryRow[]
        } | null>
    > => {
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

        // Pull matches that have both teams assigned (so they're playable).
        const matches = await db
            .select()
            .from(tournamentMatches)
            .where(
                and(
                    eq(tournamentMatches.tournament_id, config.tournamentId),
                    // home and away both set
                    // (use isNotNull via NOT isNull)
                    or(
                        // we want both NOT NULL — Drizzle has no direct NOT,
                        // so we fetch all and filter in JS for clarity
                        eq(tournamentMatches.bracket, "pool"),
                        eq(tournamentMatches.bracket, "winners"),
                        eq(tournamentMatches.bracket, "losers"),
                        eq(tournamentMatches.bracket, "final")
                    )
                )
            )
            .orderBy(
                asc(tournamentMatches.start_time),
                asc(tournamentMatches.court)
            )

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

        // Resolve team names.
        const allTeamIds = new Set<number>()
        for (const m of visible) {
            if (m.home_team_id !== null) allTeamIds.add(m.home_team_id)
            if (m.away_team_id !== null) allTeamIds.add(m.away_team_id)
        }
        const teams =
            allTeamIds.size === 0
                ? []
                : await db
                      .select({
                          id: tournamentTeams.id,
                          name: tournamentTeams.name
                      })
                      .from(tournamentTeams)
                      .where(inArray(tournamentTeams.id, [...allTeamIds]))
        const teamName = new Map(teams.map((t) => [t.id, t.name]))

        const rows: ScoreEntryRow[] = visible.map((m) => ({
            matchId: m.id,
            bracket: m.bracket,
            court: m.court,
            startTime: m.start_time,
            homeTeamId: m.home_team_id as number,
            homeTeamName: teamName.get(m.home_team_id as number) ?? "—",
            awayTeamId: m.away_team_id as number,
            awayTeamName: teamName.get(m.away_team_id as number) ?? "—",
            homeSet1: m.home_set1_score,
            awaySet1: m.away_set1_score,
            homeSet2: m.home_set2_score,
            awaySet2: m.away_set2_score,
            homeSet3: m.home_set3_score,
            awaySet3: m.away_set3_score,
            winnerTeamId: m.winner_team_id
        }))

        return ok({
            tournamentId: config.tournamentId,
            tournamentName: config.name,
            rows
        })
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

void isNull
