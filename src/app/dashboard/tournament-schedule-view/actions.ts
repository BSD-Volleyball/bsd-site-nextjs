"use server"

import { db } from "@/database/db"
import {
    tournamentMatches,
    tournamentPools,
    tournamentRoster,
    tournamentTeams
} from "@/database/schema"
import { asc, eq } from "drizzle-orm"
import {
    fail,
    ok,
    requireSession,
    withAction,
    type ActionResult
} from "@/lib/action-helpers"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { getTournamentConfig } from "@/lib/tournament-config"
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
 * Read-only schedule for the active tournament: round-robin pools plus the
 * playoff bracket. Available to tournament participants and admins/directors.
 * Returns null when there is no active tournament.
 */
export const getTournamentScheduleView = withAction(
    async (): Promise<ActionResult<TournamentScheduleView | null>> => {
        const session = await requireSession()
        const config = await getTournamentConfig()
        if (!config) return ok(null)

        // Resolve the viewer's team (used for authorization and highlighting).
        const [rosterRow] = await db
            .select({ teamId: tournamentRoster.team_id })
            .from(tournamentRoster)
            .where(eq(tournamentRoster.user_id, session.user.id))
            .limit(1)
        const myTeamId = rosterRow?.teamId ?? null

        const isAdmin = await isAdminOrDirectorBySession()
        if (!isAdmin && myTeamId === null) {
            return fail("You are not part of this tournament.")
        }

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

        return ok(
            buildTournamentScheduleView({
                tournamentName: config.name,
                eliminationFormat: config.eliminationFormat,
                myTeamId,
                divisions: config.divisions,
                matches,
                teams,
                pools
            })
        )
    }
)
