"use server"

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
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import {
    fail,
    ok,
    requireAdmin,
    requireSession,
    withAction,
    type ActionResult
} from "@/lib/action-helpers"
import {
    getTournamentConfig,
    isUserOnTournamentRoster
} from "@/lib/tournament-config"
import { getActiveWaiver, recordWaiverAcceptance } from "@/lib/waivers"
import { logAuditEntry } from "@/lib/audit-log"

export interface WaitlistEntry {
    waitlistId: number
    userId: string
    name: string
    email: string
    male: boolean | null
    preferredDivisionName: string | null
    createdAt: Date
}

export interface PlacementTarget {
    teamId: number
    teamName: string
    captainName: string
    divisionName: string
    malesRemaining: number
    nonMalesRemaining: number
}

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
        if (config.phase !== "registration_open") {
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

        await recordWaiverAcceptance(session.user.id, active.id)

        // Insert if new; otherwise update the preferred division (player may
        // re-submit with a different preference). Preserve placed_team_id
        // and approved if already set.
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
        if (!existing) {
            await db.insert(tournamentWaitlist).values({
                tournament_id: config.tournamentId,
                user_id: session.user.id,
                waiver_id: active.id,
                preferred_division_id: resolvedDivisionId
            })
        } else {
            await db
                .update(tournamentWaitlist)
                .set({ preferred_division_id: resolvedDivisionId })
                .where(eq(tournamentWaitlist.id, existing.id))
        }
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

export const getTournamentWaitlist = withAction(
    async (): Promise<
        ActionResult<{
            tournamentId: number
            tournamentName: string
            waitlist: WaitlistEntry[]
            placementTargets: PlacementTarget[]
        } | null>
    > => {
        await requireAdmin()
        const config = await getTournamentConfig()
        if (!config) return ok(null)

        // Left-join the preferred division — null when the player didn't
        // pick one (or the division was later deleted).
        const rows = await db
            .select({
                waitlistId: tournamentWaitlist.id,
                userId: tournamentWaitlist.user_id,
                createdAt: tournamentWaitlist.created_at,
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name,
                email: users.email,
                male: users.male,
                preferredDivisionName: divisions.name
            })
            .from(tournamentWaitlist)
            .innerJoin(users, eq(users.id, tournamentWaitlist.user_id))
            .leftJoin(
                tournamentDivisions,
                eq(
                    tournamentDivisions.id,
                    tournamentWaitlist.preferred_division_id
                )
            )
            .leftJoin(
                divisions,
                eq(divisions.id, tournamentDivisions.division_id)
            )
            .where(
                and(
                    eq(tournamentWaitlist.tournament_id, config.tournamentId),
                    // Only show entries not yet placed on a team — placed
                    // rows stay in the table as a waiver-acceptance record.
                    isNull(tournamentWaitlist.placed_team_id)
                )
            )
            .orderBy(asc(tournamentWaitlist.created_at))

        const waitlist: WaitlistEntry[] = rows.map((r) => ({
            waitlistId: r.waitlistId,
            userId: r.userId,
            name: `${r.first_name}${r.preferred_name ? ` (${r.preferred_name})` : ""} ${r.last_name}`,
            email: r.email,
            male: r.male,
            preferredDivisionName: r.preferredDivisionName,
            createdAt: r.createdAt
        }))

        // Build placement targets: for each team, compute remaining capacity by gender.
        const teams = await db
            .select({
                id: tournamentTeams.id,
                name: tournamentTeams.name,
                captainId: tournamentTeams.captain_user_id,
                preferredDivisionId: tournamentTeams.preferred_division_id,
                finalDivisionId: tournamentTeams.division_id
            })
            .from(tournamentTeams)
            .where(eq(tournamentTeams.tournament_id, config.tournamentId))

        const captainNames = new Map<string, string>()
        if (teams.length > 0) {
            const captainRows = await db
                .select({
                    id: users.id,
                    first_name: users.first_name,
                    last_name: users.last_name,
                    preferred_name: users.preferred_name
                })
                .from(users)
                .where(
                    inArray(
                        users.id,
                        teams.map((t) => t.captainId)
                    )
                )
            for (const c of captainRows) {
                captainNames.set(
                    c.id,
                    `${c.first_name}${c.preferred_name ? ` (${c.preferred_name})` : ""} ${c.last_name}`
                )
            }
        }

        // Pull tournament divisions joined with the league `divisions` table
        // so we can show a friendly name (e.g. "A", "BB") in the placement UI.
        const divs = await db
            .select({
                id: tournamentDivisions.id,
                name: divisions.name,
                male_per_team: tournamentDivisions.male_per_team,
                non_male_per_team: tournamentDivisions.non_male_per_team
            })
            .from(tournamentDivisions)
            .innerJoin(
                divisions,
                eq(divisions.id, tournamentDivisions.division_id)
            )
            .where(eq(tournamentDivisions.tournament_id, config.tournamentId))
        const divMap = new Map(divs.map((d) => [d.id, d]))

        const allRoster =
            teams.length === 0
                ? []
                : await db
                      .select({
                          teamId: tournamentRoster.team_id,
                          userId: tournamentRoster.user_id,
                          male: users.male
                      })
                      .from(tournamentRoster)
                      .innerJoin(users, eq(users.id, tournamentRoster.user_id))
                      .where(
                          inArray(
                              tournamentRoster.team_id,
                              teams.map((t) => t.id)
                          )
                      )

        const placementTargets: PlacementTarget[] = teams
            .map((t) => {
                const divId = t.finalDivisionId ?? t.preferredDivisionId
                const div = divMap.get(divId)
                if (!div) return null
                const tr = allRoster.filter((r) => r.teamId === t.id)
                const males = tr.filter((r) => r.male === true).length
                const nonMales = tr.filter((r) => r.male === false).length
                return {
                    teamId: t.id,
                    teamName: t.name,
                    captainName: captainNames.get(t.captainId) ?? "—",
                    divisionName: div.name,
                    malesRemaining: Math.max(0, div.male_per_team - males),
                    nonMalesRemaining: Math.max(
                        0,
                        div.non_male_per_team - nonMales
                    )
                }
            })
            .filter((p): p is PlacementTarget => p !== null)

        return ok({
            tournamentId: config.tournamentId,
            tournamentName: config.name,
            waitlist,
            placementTargets
        })
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
            await db.insert(tournamentRoster).values({
                tournament_id: entry.tournament_id,
                team_id: teamId,
                user_id: entry.user_id,
                added_by_user_id: session.user.id
            })
        } catch (e) {
            console.error("placeWaitlistPlayerOnTeam failed:", e)
            return fail("Could not place player (may already be on a team).")
        }

        await db
            .update(tournamentWaitlist)
            .set({ placed_team_id: teamId, approved: true })
            .where(eq(tournamentWaitlist.id, waitlistId))

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
