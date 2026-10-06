"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { tournamentMatches } from "@/database/schema"
import { and, eq, ne } from "drizzle-orm"
import {
    fail,
    ok,
    requireAdmin,
    requireSession,
    requirePositiveInt,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"

export const updateScheduleRow = withAction(
    async (
        matchId: number,
        update: {
            court: number | null
            startTime: string | null
            workTeamId: number | null
        }
    ): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()
        const id = requirePositiveInt(matchId, "match ID")

        const [match] = await db
            .select()
            .from(tournamentMatches)
            .where(eq(tournamentMatches.id, id))
            .limit(1)
        if (!match) return fail("Match not found.")

        // Work team must not be one of the playing teams.
        if (
            update.workTeamId !== null &&
            (update.workTeamId === match.home_team_id ||
                update.workTeamId === match.away_team_id)
        ) {
            return fail("Work team cannot be one of the playing teams.")
        }

        await db
            .update(tournamentMatches)
            .set({
                court: update.court,
                start_time: update.startTime,
                work_team_id: update.workTeamId
            })
            .where(eq(tournamentMatches.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "update_tournament_schedule",
            entityType: "tournament_match",
            entityId: id,
            summary: `Updated schedule (court ${update.court ?? "—"}, time ${update.startTime ?? "—"}, work team ${update.workTeamId ?? "—"})`
        })

        revalidatePath("/dashboard/tournament-schedule")
        return ok()
    }
)

void and
void ne
