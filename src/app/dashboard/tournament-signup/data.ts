import "server-only"

import { formatPlayerName } from "@/lib/utils"
import { db } from "@/database/db"
import { tournamentRoster, users } from "@/database/schema"
import { eq, notInArray } from "drizzle-orm"
import {
    ok,
    requireSession,
    withAction,
    type ActionResult
} from "@/next/action-helpers"

export interface EligiblePlayer {
    id: string
    name: string
    male: boolean | null
}

/**
 * Players eligible to be rostered: not already on any team in this tournament.
 * Returned with gender so the client can group into male / non-male columns
 * and enforce per-division caps as the captain picks.
 */
export const getEligibleTournamentPlayers = withAction(
    async (tournamentId: number): Promise<ActionResult<EligiblePlayer[]>> => {
        await requireSession()

        const rostered = await db
            .select({ userId: tournamentRoster.user_id })
            .from(tournamentRoster)
            .where(eq(tournamentRoster.tournament_id, tournamentId))
        const exclude = rostered.map((r) => r.userId)

        const rows =
            exclude.length === 0
                ? await db
                      .select({
                          id: users.id,
                          first_name: users.first_name,
                          last_name: users.last_name,
                          preferred_name: users.preferred_name,
                          male: users.male
                      })
                      .from(users)
                      .orderBy(users.last_name, users.first_name)
                : await db
                      .select({
                          id: users.id,
                          first_name: users.first_name,
                          last_name: users.last_name,
                          preferred_name: users.preferred_name,
                          male: users.male
                      })
                      .from(users)
                      .where(notInArray(users.id, exclude))
                      .orderBy(users.last_name, users.first_name)

        return ok(
            rows.map((u) => ({
                id: u.id,
                name: formatPlayerName(
                    u.first_name,
                    u.last_name,
                    u.preferred_name
                ),
                male: u.male
            }))
        )
    }
)
