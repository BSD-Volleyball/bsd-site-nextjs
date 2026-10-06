"use server"

import { logger } from "@/lib/logger"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    tournamentDivisions,
    tournamentRoster,
    tournamentTeams,
    tournamentWaitlist
} from "@/database/schema"
import { and, eq } from "drizzle-orm"
import {
    fail,
    ok,
    requireAdmin,
    requireSession,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import {
    getTournamentConfig,
    isPlayerSignupOpen,
    isUserOnTournamentRoster
} from "@/lib/tournament-config"
import { getActiveWaiver, recordWaiverAcceptance } from "@/lib/waivers"
import { logAuditEntry } from "@/lib/audit-log"

export const expressTournamentInterest = withAction(
    async (
        waiverId: number,
        agreed: boolean,
        // 0 / null means "no preference"
        preferredDivisionId: number | null
    ): Promise<ActionResult<void>> => {
        const session = await requireSession()
        if (!agreed) return fail("You must agree to the waiver.")

        const active = await getActiveWaiver()
        if (!active || active.id !== waiverId) {
            return fail("Waiver was updated. Reload and try again.")
        }

        const config = await getTournamentConfig()
        if (!config) return fail("No active tournament.")
        if (!isPlayerSignupOpen(config)) {
            return fail("Tournament is not accepting interest right now.")
        }
        if (
            await isUserOnTournamentRoster(config.tournamentId, session.user.id)
        ) {
            return fail("You are already on a team in this tournament.")
        }

        // Validate division (if supplied) belongs to this tournament.
        let resolvedDivisionId: number | null = null
        if (preferredDivisionId && preferredDivisionId > 0) {
            const [div] = await db
                .select({ id: tournamentDivisions.id })
                .from(tournamentDivisions)
                .where(
                    and(
                        eq(tournamentDivisions.id, preferredDivisionId),
                        eq(
                            tournamentDivisions.tournament_id,
                            config.tournamentId
                        )
                    )
                )
                .limit(1)
            if (!div) return fail("Invalid preferred division.")
            resolvedDivisionId = div.id
        }

        const [existing] = await db
            .select({ id: tournamentWaitlist.id })
            .from(tournamentWaitlist)
            .where(
                and(
                    eq(tournamentWaitlist.tournament_id, config.tournamentId),
                    eq(tournamentWaitlist.user_id, session.user.id)
                )
            )
            .limit(1)

        // Waiver acceptance and the waitlist row land together. Upsert on
        // (tournament, user): a new row, or a re-submission that only changes
        // the preferred division, keeping placed_team_id and approved.
        await db.transaction(async (tx) => {
            await recordWaiverAcceptance(
                session.user.id,
                active.id,
                undefined,
                tx
            )
            await tx
                .insert(tournamentWaitlist)
                .values({
                    tournament_id: config.tournamentId,
                    user_id: session.user.id,
                    waiver_id: active.id,
                    preferred_division_id: resolvedDivisionId
                })
                .onConflictDoUpdate({
                    target: [
                        tournamentWaitlist.tournament_id,
                        tournamentWaitlist.user_id
                    ],
                    set: { preferred_division_id: resolvedDivisionId }
                })
        })
        await logAuditEntry({
            userId: session.user.id,
            action: existing
                ? "update_tournament_player_signup"
                : "create_tournament_player_signup",
            entityType: "tournament",
            entityId: config.tournamentId,
            summary: existing
                ? `Updated player signup preferred division (${resolvedDivisionId ?? "no preference"})`
                : `Signed up as a player for ${config.name} (preferred division: ${resolvedDivisionId ?? "none"}); accepted waiver`
        })
        revalidatePath("/dashboard")
        return ok()
    }
)

export const withdrawTournamentInterest = withAction(
    async (): Promise<ActionResult<void>> => {
        const session = await requireSession()

        const config = await getTournamentConfig()
        if (!config) return fail("No active tournament.")

        const [entry] = await db
            .select()
            .from(tournamentWaitlist)
            .where(
                and(
                    eq(tournamentWaitlist.tournament_id, config.tournamentId),
                    eq(tournamentWaitlist.user_id, session.user.id)
                )
            )
            .limit(1)
        if (!entry) {
            return fail("You're not signed up as a player for this tournament.")
        }
        // Once placed on a roster the player can no longer self-withdraw — a
        // captain/admin has committed them to a team, so removal has to go
        // through the admin flow to keep rosters consistent.
        if (entry.placed_team_id !== null) {
            return fail(
                "You're already on a team. Ask an admin or your captain to remove you."
            )
        }

        await db
            .delete(tournamentWaitlist)
            .where(eq(tournamentWaitlist.id, entry.id))

        await logAuditEntry({
            userId: session.user.id,
            action: "withdraw_tournament_player_signup",
            entityType: "tournament",
            entityId: config.tournamentId,
            summary: `Withdrew player signup for ${config.name}`
        })
        revalidatePath("/dashboard")
        return ok(undefined, "Your interest has been withdrawn.")
    }
)

export const removeWaitlistPlayer = withAction(
    async (waitlistId: number): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()

        const [entry] = await db
            .select()
            .from(tournamentWaitlist)
            .where(eq(tournamentWaitlist.id, waitlistId))
            .limit(1)
        if (!entry) return fail("Player is no longer on the list.")
        // Guard against removing someone who has since been placed on a team;
        // the Place page only lists unplaced players, but a concurrent
        // placement could have happened between page load and this click.
        if (entry.placed_team_id !== null) {
            return fail(
                "This player has already been placed on a team and can't be removed here."
            )
        }

        await db
            .delete(tournamentWaitlist)
            .where(eq(tournamentWaitlist.id, waitlistId))

        await logAuditEntry({
            userId: session.user.id,
            action: "remove_tournament_waitlist",
            entityType: "tournament",
            entityId: entry.tournament_id,
            summary: `Removed user ${entry.user_id} from the tournament player list`
        })

        revalidatePath("/dashboard/view-tournament-waitlist")
        revalidatePath("/dashboard")
        return ok(undefined, "Player removed.")
    }
)

export const placeWaitlistPlayerOnTeam = withAction(
    async (waitlistId: number, teamId: number): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()

        const [entry] = await db
            .select()
            .from(tournamentWaitlist)
            .where(eq(tournamentWaitlist.id, waitlistId))
            .limit(1)
        if (!entry) return fail("Waitlist entry not found.")

        const [team] = await db
            .select()
            .from(tournamentTeams)
            .where(eq(tournamentTeams.id, teamId))
            .limit(1)
        if (!team || team.tournament_id !== entry.tournament_id) {
            return fail("Team not found for this tournament.")
        }

        try {
            await db.transaction(async (tx) => {
                await tx.insert(tournamentRoster).values({
                    tournament_id: entry.tournament_id,
                    team_id: teamId,
                    user_id: entry.user_id,
                    added_by_user_id: session.user.id
                })
                await tx
                    .update(tournamentWaitlist)
                    .set({ placed_team_id: teamId, approved: true })
                    .where(eq(tournamentWaitlist.id, waitlistId))
            })
        } catch (e) {
            logger.error("placeWaitlistPlayerOnTeam failed", undefined, e)
            return fail("Could not place player (may already be on a team).")
        }

        await logAuditEntry({
            userId: session.user.id,
            action: "place_tournament_waitlist",
            entityType: "tournament_team",
            entityId: teamId,
            summary: `Placed user ${entry.user_id} on team ${teamId}`
        })

        revalidatePath("/dashboard/view-tournament-waitlist")
        revalidatePath("/dashboard")
        return ok()
    }
)
