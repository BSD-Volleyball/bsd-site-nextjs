"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    tournamentDivisions,
    tournamentRoster,
    tournamentTeams,
    tournamentWaitlist,
    users,
    waiverAcceptances
} from "@/database/schema"
import { and, eq, inArray } from "drizzle-orm"
import {
    fail,
    ok,
    requireSession,
    withAction,
    type ActionResult
} from "@/lib/action-helpers"
import { getTournamentConfig, isRosterLocked } from "@/lib/tournament-config"
import { getActiveWaiver, recordWaiverAcceptance } from "@/lib/waivers"
import { logAuditEntry } from "@/lib/audit-log"

export interface TeamRosterEntry {
    userId: string
    name: string
    male: boolean | null
    addedByCaptain: boolean
    waiverAccepted: boolean
}

export interface CaptainTeamView {
    tournamentId: number
    tournamentName: string
    rosterLocked: boolean
    team: {
        id: number
        name: string
        preferredDivisionId: number
        finalDivisionId: number | null
    }
    divisions: {
        id: number
        name: string
        malePerTeam: number
        nonMalePerTeam: number
    }[]
    roster: TeamRosterEntry[]
    eligibleToAdd: {
        id: string
        name: string
        male: boolean | null
    }[]
}

async function loadTeamForCaptain(tournamentId: number, captainUserId: string) {
    const [team] = await db
        .select()
        .from(tournamentTeams)
        .where(
            and(
                eq(tournamentTeams.tournament_id, tournamentId),
                eq(tournamentTeams.captain_user_id, captainUserId)
            )
        )
        .limit(1)
    return team ?? null
}

export const getCaptainTeamView = withAction(
    async (): Promise<ActionResult<CaptainTeamView | null>> => {
        const session = await requireSession()
        const config = await getTournamentConfig()
        if (!config) return ok(null)

        const team = await loadTeamForCaptain(
            config.tournamentId,
            session.user.id
        )
        if (!team) return ok(null)

        const activeWaiver = await getActiveWaiver()

        const rosterRows = await db
            .select({
                userId: tournamentRoster.user_id,
                addedBy: tournamentRoster.added_by_user_id,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name,
                male: users.male
            })
            .from(tournamentRoster)
            .innerJoin(users, eq(users.id, tournamentRoster.user_id))
            .where(eq(tournamentRoster.team_id, team.id))

        let acceptedByUser = new Set<string>()
        if (activeWaiver && rosterRows.length > 0) {
            const accepts = await db
                .select({ userId: waiverAcceptances.user_id })
                .from(waiverAcceptances)
                .where(
                    and(
                        eq(waiverAcceptances.waiver_id, activeWaiver.id),
                        inArray(
                            waiverAcceptances.user_id,
                            rosterRows.map((r) => r.userId)
                        )
                    )
                )
            acceptedByUser = new Set(accepts.map((a) => a.userId))
        }

        const roster: TeamRosterEntry[] = rosterRows.map((r) => ({
            userId: r.userId,
            name: `${r.first_name}${r.preferred_name ? ` (${r.preferred_name})` : ""} ${r.last_name}`,
            male: r.male,
            addedByCaptain:
                r.addedBy === session.user.id && r.userId !== session.user.id,
            waiverAccepted: acceptedByUser.has(r.userId)
        }))

        // Eligible to add: not currently rostered in any team for this tournament.
        const allRostered = await db
            .select({ userId: tournamentRoster.user_id })
            .from(tournamentRoster)
            .where(eq(tournamentRoster.tournament_id, config.tournamentId))
        const exclude = new Set(allRostered.map((r) => r.userId))
        const candidateRows = await db
            .select({
                id: users.id,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name,
                male: users.male
            })
            .from(users)
            .orderBy(users.last_name, users.first_name)
        const eligibleToAdd = candidateRows
            .filter((u) => !exclude.has(u.id))
            .map((u) => ({
                id: u.id,
                name: `${u.first_name}${u.preferred_name ? ` (${u.preferred_name})` : ""} ${u.last_name}`,
                male: u.male
            }))

        return ok({
            tournamentId: config.tournamentId,
            tournamentName: config.name,
            rosterLocked: isRosterLocked(config),
            team: {
                id: team.id,
                name: team.name,
                preferredDivisionId: team.preferred_division_id,
                finalDivisionId: team.division_id
            },
            divisions: config.divisions.map((d) => ({
                id: d.id,
                name: d.divisionName,
                malePerTeam: d.malePerTeam,
                nonMalePerTeam: d.nonMalePerTeam
            })),
            roster,
            eligibleToAdd
        })
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

        try {
            await db.insert(tournamentRoster).values({
                tournament_id: config.tournamentId,
                team_id: team.id,
                user_id: userId,
                added_by_user_id: session.user.id
            })
        } catch (e) {
            console.error("addPlayerToRoster failed:", e)
            return fail("Could not add player.")
        }

        // If the player is on the waitlist, mark them as placed on this team.
        // (We update rather than delete so the pre-acceptance record stays.)
        await db
            .update(tournamentWaitlist)
            .set({ placed_team_id: team.id, approved: true })
            .where(
                and(
                    eq(tournamentWaitlist.tournament_id, config.tournamentId),
                    eq(tournamentWaitlist.user_id, userId)
                )
            )

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

        await db
            .delete(tournamentRoster)
            .where(
                and(
                    eq(tournamentRoster.team_id, team.id),
                    eq(tournamentRoster.user_id, userId)
                )
            )

        // If the removed player was previously placed on this team via the
        // waitlist, mark them available again so a captain (or admin) can
        // pick them up. Don't touch rows placed on a *different* team.
        await db
            .update(tournamentWaitlist)
            .set({ placed_team_id: null })
            .where(
                and(
                    eq(tournamentWaitlist.tournament_id, config.tournamentId),
                    eq(tournamentWaitlist.user_id, userId),
                    eq(tournamentWaitlist.placed_team_id, team.id)
                )
            )

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
