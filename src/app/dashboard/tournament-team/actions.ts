"use server"

import { logger } from "@/lib/logger"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    divisions,
    tournamentDivisions,
    tournamentRoster,
    tournamentTeams,
    tournamentWaitlist,
    users
} from "@/database/schema"
import { and, eq } from "drizzle-orm"
import {
    fail,
    ok,
    requireSession,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import { getTournamentConfig, isRosterLocked } from "@/lib/tournament-config"
import { getActiveWaiver, recordWaiverAcceptance } from "@/lib/waivers"
import { logAuditEntry } from "@/lib/audit-log"
import { loadTeamForCaptain } from "./data"

export const updateTeamName = withAction(
    async (rawName: string): Promise<ActionResult<void>> => {
        const session = await requireSession()
        const config = await getTournamentConfig()
        if (!config) return fail("No active tournament.")
        if (isRosterLocked(config)) return fail("Roster is locked.")

        const name = rawName.trim()
        if (!name) return fail("Team name is required.")
        if (name.length > 80) return fail("Team name is too long.")

        const team = await loadTeamForCaptain(
            config.tournamentId,
            session.user.id
        )
        if (!team) return fail("Team not found.")

        if (team.name === name) return ok()

        await db
            .update(tournamentTeams)
            .set({ name })
            .where(eq(tournamentTeams.id, team.id))

        await logAuditEntry({
            userId: session.user.id,
            action: "update_tournament_team_name",
            entityType: "tournament_team",
            entityId: team.id,
            summary: `Captain renamed team from "${team.name}" to "${name}"`
        })

        revalidatePath("/dashboard/tournament-team")
        revalidatePath("/dashboard")
        return ok()
    }
)

export const updatePreferredDivision = withAction(
    async (divisionId: number): Promise<ActionResult<void>> => {
        const session = await requireSession()
        const config = await getTournamentConfig()
        if (!config) return fail("No active tournament.")
        if (isRosterLocked(config)) return fail("Roster is locked.")

        const team = await loadTeamForCaptain(
            config.tournamentId,
            session.user.id
        )
        if (!team) return fail("Team not found.")

        const [division] = await db
            .select({ id: tournamentDivisions.id })
            .from(tournamentDivisions)
            .where(
                and(
                    eq(tournamentDivisions.tournament_id, config.tournamentId),
                    eq(tournamentDivisions.id, divisionId)
                )
            )
            .limit(1)
        if (!division) return fail("Invalid division.")

        await db
            .update(tournamentTeams)
            .set({ preferred_division_id: divisionId })
            .where(eq(tournamentTeams.id, team.id))

        await logAuditEntry({
            userId: session.user.id,
            action: "update_tournament_team_division",
            entityType: "tournament_team",
            entityId: team.id,
            summary: `Captain set preferred division to ${divisionId}`
        })

        revalidatePath("/dashboard/tournament-team")
        return ok()
    }
)

/**
 * Would adding this player push the team past its division's male or
 * non-male cap? Registration checks the whole roster against the caps
 * (validateRosterAgainstDivision); adding players one at a time afterwards
 * must respect the same limits. Returns an error message, or null.
 */
async function rosterCapError(
    team: {
        id: number
        division_id: number | null
        preferred_division_id: number
    },
    userId: string
): Promise<string | null> {
    const [player] = await db
        .select({ male: users.male })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    if (!player) return "Player not found."

    const [division] = await db
        .select({
            name: divisions.name,
            malePerTeam: tournamentDivisions.male_per_team,
            nonMalePerTeam: tournamentDivisions.non_male_per_team
        })
        .from(tournamentDivisions)
        .innerJoin(divisions, eq(divisions.id, tournamentDivisions.division_id))
        .where(
            eq(
                tournamentDivisions.id,
                team.division_id ?? team.preferred_division_id
            )
        )
        .limit(1)
    if (!division) return null

    const roster = await db
        .select({ male: users.male })
        .from(tournamentRoster)
        .innerJoin(users, eq(users.id, tournamentRoster.user_id))
        .where(eq(tournamentRoster.team_id, team.id))
    const males =
        roster.filter((r) => r.male === true).length +
        (player.male === true ? 1 : 0)
    const nonMales =
        roster.filter((r) => r.male === false).length +
        (player.male === false ? 1 : 0)

    if (males > division.malePerTeam) {
        return `Roster would exceed the male cap (${males} / ${division.malePerTeam}) for ${division.name}.`
    }
    if (nonMales > division.nonMalePerTeam) {
        return `Roster would exceed the non-male cap (${nonMales} / ${division.nonMalePerTeam}) for ${division.name}.`
    }
    return null
}

export const addPlayerToRoster = withAction(
    async (userId: string): Promise<ActionResult<void>> => {
        const session = await requireSession()
        const config = await getTournamentConfig()
        if (!config) return fail("No active tournament.")
        if (isRosterLocked(config)) return fail("Roster is locked.")

        const team = await loadTeamForCaptain(
            config.tournamentId,
            session.user.id
        )
        if (!team) return fail("Team not found.")

        const [already] = await db
            .select({ id: tournamentRoster.id })
            .from(tournamentRoster)
            .where(
                and(
                    eq(tournamentRoster.tournament_id, config.tournamentId),
                    eq(tournamentRoster.user_id, userId)
                )
            )
            .limit(1)
        if (already)
            return fail("Player is already on a team in this tournament.")

        const capError = await rosterCapError(team, userId)
        if (capError) return fail(capError)

        try {
            await db.transaction(async (tx) => {
                await tx.insert(tournamentRoster).values({
                    tournament_id: config.tournamentId,
                    team_id: team.id,
                    user_id: userId,
                    added_by_user_id: session.user.id
                })

                // If the player is on the waitlist, mark them as placed on
                // this team. (We update rather than delete so the
                // pre-acceptance record stays.)
                await tx
                    .update(tournamentWaitlist)
                    .set({ placed_team_id: team.id, approved: true })
                    .where(
                        and(
                            eq(
                                tournamentWaitlist.tournament_id,
                                config.tournamentId
                            ),
                            eq(tournamentWaitlist.user_id, userId)
                        )
                    )
            })
        } catch (e) {
            logger.error("addPlayerToRoster failed", undefined, e)
            return fail("Could not add player.")
        }

        await logAuditEntry({
            userId: session.user.id,
            action: "add_tournament_roster",
            entityType: "tournament_team",
            entityId: team.id,
            summary: `Captain added user ${userId} to roster`
        })

        revalidatePath("/dashboard/tournament-team")
        revalidatePath("/dashboard")
        return ok()
    }
)

export const removePlayerFromRoster = withAction(
    async (userId: string): Promise<ActionResult<void>> => {
        const session = await requireSession()
        const config = await getTournamentConfig()
        if (!config) return fail("No active tournament.")
        if (isRosterLocked(config)) return fail("Roster is locked.")
        if (userId === session.user.id) {
            return fail("Captain cannot remove themselves from the roster.")
        }

        const team = await loadTeamForCaptain(
            config.tournamentId,
            session.user.id
        )
        if (!team) return fail("Team not found.")

        await db.transaction(async (tx) => {
            await tx
                .delete(tournamentRoster)
                .where(
                    and(
                        eq(tournamentRoster.team_id, team.id),
                        eq(tournamentRoster.user_id, userId)
                    )
                )

            // If the removed player was previously placed on this team via
            // the waitlist, mark them available again so a captain (or
            // admin) can pick them up. Don't touch rows placed on a
            // *different* team.
            await tx
                .update(tournamentWaitlist)
                .set({ placed_team_id: null })
                .where(
                    and(
                        eq(
                            tournamentWaitlist.tournament_id,
                            config.tournamentId
                        ),
                        eq(tournamentWaitlist.user_id, userId),
                        eq(tournamentWaitlist.placed_team_id, team.id)
                    )
                )
        })

        await logAuditEntry({
            userId: session.user.id,
            action: "remove_tournament_roster",
            entityType: "tournament_team",
            entityId: team.id,
            summary: `Captain removed user ${userId} from roster`
        })

        revalidatePath("/dashboard/tournament-team")
        revalidatePath("/dashboard")
        return ok()
    }
)

/**
 * Player-facing: accepts the active waiver. Used by the dashboard
 * "Accept Tournament Waiver" card for players added by a captain.
 */
export const acceptTournamentWaiver = withAction(
    async (waiverId: number): Promise<ActionResult<void>> => {
        const session = await requireSession()
        const active = await getActiveWaiver()
        if (!active || active.id !== waiverId) {
            return fail(
                "The waiver was updated. Reload the page and try again."
            )
        }
        await recordWaiverAcceptance(session.user.id, active.id)
        await logAuditEntry({
            userId: session.user.id,
            action: "accept_tournament_waiver",
            entityType: "waiver",
            entityId: active.id,
            summary: `Accepted tournament waiver (id ${active.id})`
        })
        revalidatePath("/dashboard")
        return ok()
    }
)
