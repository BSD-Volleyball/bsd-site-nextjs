"use server"

import { formatPlayerName } from "@/lib/utils"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    tournamentPoolTeams,
    tournamentPools,
    tournamentTeams,
    users
} from "@/database/schema"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import {
    fail,
    ok,
    requireAdmin,
    requireSession,
    requirePositiveInt,
    withAction,
    type ActionResult
} from "@/lib/action-helpers"
import { getTournamentConfig } from "@/lib/tournament-config"
import { logAuditEntry } from "@/lib/audit-log"

export interface PoolView {
    poolId: number
    poolName: string
    teams: { id: number; name: string }[]
}

export interface DivisionPoolView {
    divisionId: number
    divisionName: string
    teamCount: number
    pools: PoolView[]
    unpooledTeams: { id: number; name: string }[]
    unassignedTeams: {
        id: number
        name: string
        preferredDivisionId: number
        captainName: string
    }[]
}

export interface TournamentPoolsView {
    tournamentId: number
    tournamentName: string
    divisions: DivisionPoolView[]
    teamsMissingDivision: { id: number; name: string; preferred: string }[]
}

export const getTournamentPoolsView = withAction(
    async (): Promise<ActionResult<TournamentPoolsView | null>> => {
        await requireAdmin()
        const config = await getTournamentConfig()
        if (!config) return ok(null)

        const teams = await db
            .select({
                id: tournamentTeams.id,
                name: tournamentTeams.name,
                preferredDivisionId: tournamentTeams.preferred_division_id,
                divisionId: tournamentTeams.division_id,
                captainId: tournamentTeams.captain_user_id
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
                    formatPlayerName(
                        c.first_name,
                        c.last_name,
                        c.preferred_name
                    )
                )
            }
        }

        const pools = await db
            .select()
            .from(tournamentPools)
            .where(eq(tournamentPools.tournament_id, config.tournamentId))
            .orderBy(asc(tournamentPools.sort_order))

        const poolTeams = await db
            .select({
                poolId: tournamentPoolTeams.pool_id,
                teamId: tournamentPoolTeams.team_id
            })
            .from(tournamentPoolTeams)
            .where(eq(tournamentPoolTeams.tournament_id, config.tournamentId))

        const teamById = new Map(teams.map((t) => [t.id, t]))
        const divisionMap = new Map(
            config.divisions.map((d) => [d.id, d.divisionName])
        )
        const pooledTeamIds = new Set(poolTeams.map((pt) => pt.teamId))

        const teamsMissingDivision = teams
            .filter((t) => t.divisionId === null)
            .map((t) => ({
                id: t.id,
                name: t.name,
                preferred: divisionMap.get(t.preferredDivisionId) ?? "—"
            }))

        const divisions: DivisionPoolView[] = config.divisions.map((d) => {
            const divisionPools: PoolView[] = pools
                .filter((p) => p.division_id === d.id)
                .map((p) => ({
                    poolId: p.id,
                    poolName: p.name,
                    teams: poolTeams
                        .filter((pt) => pt.poolId === p.id)
                        .map((pt) => {
                            const team = teamById.get(pt.teamId)
                            return team
                                ? { id: team.id, name: team.name }
                                : null
                        })
                        .filter(
                            (x): x is { id: number; name: string } => x !== null
                        )
                }))

            const teamsInThisDivision = teams.filter(
                (t) => t.divisionId === d.id
            )
            const unpooledTeams = teamsInThisDivision
                .filter((t) => !pooledTeamIds.has(t.id))
                .map((t) => ({ id: t.id, name: t.name }))

            // Teams that prefer this division but have no final division yet
            // — admin can assign them via assignTeamToDivision.
            const unassignedTeams = teams
                .filter(
                    (t) =>
                        t.divisionId === null && t.preferredDivisionId === d.id
                )
                .map((t) => ({
                    id: t.id,
                    name: t.name,
                    preferredDivisionId: t.preferredDivisionId,
                    captainName: captainNames.get(t.captainId) ?? "—"
                }))

            return {
                divisionId: d.id,
                divisionName: d.divisionName,
                teamCount: d.teamCount,
                pools: divisionPools,
                unpooledTeams,
                unassignedTeams
            }
        })

        return ok({
            tournamentId: config.tournamentId,
            tournamentName: config.name,
            divisions,
            teamsMissingDivision
        })
    }
)

export const assignTeamToDivision = withAction(
    async (teamId: number, divisionId: number): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()
        const tid = requirePositiveInt(teamId, "team ID")
        const did = requirePositiveInt(divisionId, "division ID")

        const config = await getTournamentConfig()
        if (!config) return fail("No active tournament.")

        const [team] = await db
            .select()
            .from(tournamentTeams)
            .where(eq(tournamentTeams.id, tid))
            .limit(1)
        if (!team || team.tournament_id !== config.tournamentId) {
            return fail("Team not found in active tournament.")
        }

        const divName = config.divisions.find((d) => d.id === did)?.divisionName
        if (!divName) return fail("Division not found.")

        await db
            .update(tournamentTeams)
            .set({ division_id: did })
            .where(eq(tournamentTeams.id, tid))

        await logAuditEntry({
            userId: session.user.id,
            action: "assign_tournament_division",
            entityType: "tournament_team",
            entityId: tid,
            summary: `Assigned team to division ${divName}`
        })

        revalidatePath("/dashboard/tournament-pools")
        return ok()
    }
)

export const createPool = withAction(
    async (
        divisionId: number,
        name: string
    ): Promise<ActionResult<{ poolId: number }>> => {
        const session = await requireSession()
        await requireAdmin()
        const did = requirePositiveInt(divisionId, "division ID")
        const poolName = name.trim()
        if (!poolName) return fail("Pool name required.")

        const config = await getTournamentConfig()
        if (!config) return fail("No active tournament.")

        const existing = await db
            .select({ id: tournamentPools.id })
            .from(tournamentPools)
            .where(eq(tournamentPools.division_id, did))
        const sortOrder = existing.length

        const [row] = await db
            .insert(tournamentPools)
            .values({
                tournament_id: config.tournamentId,
                division_id: did,
                name: poolName,
                sort_order: sortOrder
            })
            .returning({ id: tournamentPools.id })

        await logAuditEntry({
            userId: session.user.id,
            action: "create_tournament_pool",
            entityType: "tournament_pool",
            entityId: row.id,
            summary: `Created pool "${poolName}" in division ${did}`
        })
        revalidatePath("/dashboard/tournament-pools")
        return ok({ poolId: row.id })
    }
)

export const addTeamToPool = withAction(
    async (poolId: number, teamId: number): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()
        const config = await getTournamentConfig()
        if (!config) return fail("No active tournament.")

        try {
            await db.insert(tournamentPoolTeams).values({
                tournament_id: config.tournamentId,
                pool_id: poolId,
                team_id: teamId
            })
        } catch (e) {
            console.error("addTeamToPool failed:", e)
            return fail("Team is already in a pool.")
        }
        await logAuditEntry({
            userId: session.user.id,
            action: "add_team_to_pool",
            entityType: "tournament_pool",
            entityId: poolId,
            summary: `Added team ${teamId} to pool ${poolId}`
        })
        revalidatePath("/dashboard/tournament-pools")
        return ok()
    }
)

export const removeTeamFromPool = withAction(
    async (poolId: number, teamId: number): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()
        await db
            .delete(tournamentPoolTeams)
            .where(
                and(
                    eq(tournamentPoolTeams.pool_id, poolId),
                    eq(tournamentPoolTeams.team_id, teamId)
                )
            )
        await logAuditEntry({
            userId: session.user.id,
            action: "remove_team_from_pool",
            entityType: "tournament_pool",
            entityId: poolId,
            summary: `Removed team ${teamId} from pool ${poolId}`
        })
        revalidatePath("/dashboard/tournament-pools")
        return ok()
    }
)

export const deletePool = withAction(
    async (poolId: number): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()
        // Refuse if the pool still has teams.
        const [hasTeam] = await db
            .select({ id: tournamentPoolTeams.id })
            .from(tournamentPoolTeams)
            .where(eq(tournamentPoolTeams.pool_id, poolId))
            .limit(1)
        if (hasTeam) return fail("Remove all teams from the pool first.")
        await db.delete(tournamentPools).where(eq(tournamentPools.id, poolId))
        await logAuditEntry({
            userId: session.user.id,
            action: "delete_tournament_pool",
            entityType: "tournament_pool",
            entityId: poolId,
            summary: `Deleted pool ${poolId}`
        })
        revalidatePath("/dashboard/tournament-pools")
        return ok()
    }
)

void isNull
