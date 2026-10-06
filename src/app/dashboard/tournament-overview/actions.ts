"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { tournamentMatches, tournamentTeams } from "@/database/schema"
import { and, eq, or } from "drizzle-orm"
import {
    fail,
    ok,
    requireAdmin,
    requireSession,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"

export const withdrawTournamentTeam = withAction(
    async (teamId: number): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()

        if (!Number.isInteger(teamId) || teamId <= 0) {
            return fail("Invalid team.")
        }

        const [team] = await db
            .select({
                id: tournamentTeams.id,
                name: tournamentTeams.name,
                tournamentId: tournamentTeams.tournament_id
            })
            .from(tournamentTeams)
            .where(eq(tournamentTeams.id, teamId))
            .limit(1)
        if (!team) return fail("Team not found.")

        // Refuse if the schedule already references this team. Pool/bracket
        // matches point at teams with no ON DELETE action, so the delete would
        // hit a foreign-key violation. Withdrawals are expected before the
        // schedule is generated — the admin must clear/regenerate it first.
        const [matchRef] = await db
            .select({ id: tournamentMatches.id })
            .from(tournamentMatches)
            .where(
                and(
                    eq(tournamentMatches.tournament_id, team.tournamentId),
                    or(
                        eq(tournamentMatches.home_team_id, teamId),
                        eq(tournamentMatches.away_team_id, teamId),
                        eq(tournamentMatches.winner_team_id, teamId),
                        eq(tournamentMatches.work_team_id, teamId)
                    )
                )
            )
            .limit(1)
        if (matchRef) {
            return fail(
                "This team is already in the schedule. Clear or regenerate the schedule before withdrawing them."
            )
        }

        // Roster and pool-team rows cascade-delete with the team; any waitlist
        // rows that were placed on it have placed_team_id reset to null (via
        // ON DELETE SET NULL), returning those players to the unplaced list.
        await db.delete(tournamentTeams).where(eq(tournamentTeams.id, teamId))

        await logAuditEntry({
            userId: session.user.id,
            action: "withdraw_tournament_team",
            entityType: "tournament_team",
            entityId: teamId,
            summary: `Withdrew team "${team.name}" from tournament ${team.tournamentId} (no refund issued)`
        })

        revalidatePath("/dashboard/tournament-overview")
        revalidatePath("/dashboard")
        return ok(undefined, "Team withdrawn.")
    }
)
