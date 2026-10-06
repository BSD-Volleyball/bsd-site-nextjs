import "server-only"

import { db } from "@/database/db"
import {
    tournamentMatches,
    tournamentPools,
    tournamentRoster,
    tournamentTeams
} from "@/database/schema"
import { and, asc, eq } from "drizzle-orm"
import {
    ok,
    requireSession,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import { getTournamentConfig } from "@/lib/tournament-config"
import { isAdminOrDirectorBySession } from "@/next/session"
import {
    buildTournamentScheduleView,
    type TournamentScheduleView
} from "@/lib/tournament-schedule"

export interface ScoreEntryData {
    view: TournamentScheduleView
    // Sets per match by phase — drives how many set inputs to render.
    poolSetsCount: number
    playoffSetsCount: number
}

/**
 * Matches the current viewer may enter scores for, shaped into the same
 * division → pools + bracket-groups structure the read-only schedule view uses.
 * Admins/directors see every playable match; other users see only matches whose
 * work team they are rostered on. Returns null when there is no active tournament.
 */
export const getScoreEntryRows = withAction(
    async (): Promise<ActionResult<ScoreEntryData | null>> => {
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

        const view = buildTournamentScheduleView({
            tournamentName: config.name,
            eliminationFormat: config.eliminationFormat,
            myTeamId,
            divisions: config.divisions,
            matches: visible,
            teams,
            pools
        })

        return ok({
            view,
            poolSetsCount: config.poolSets.count,
            playoffSetsCount: config.playoffSets.count
        })
    }
)
