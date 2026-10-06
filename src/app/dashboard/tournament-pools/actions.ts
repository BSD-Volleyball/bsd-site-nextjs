"use server"

import { logger } from "@/lib/logger"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    tournamentMatches,
    tournamentPoolTeams,
    tournamentPools,
    tournamentTeams
} from "@/database/schema"
import { and, eq, isNull, ne } from "drizzle-orm"
import {
    fail,
    ok,
    requireAdmin,
    requireSession,
    requirePositiveInt,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import { getTournamentConfig } from "@/lib/tournament-config"
import { seedTournamentBracket } from "@/lib/tournament-brackets"
import { logAuditEntry } from "@/lib/audit-log"
import { hasAnySetScore } from "./data"

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
            logger.error("addTeamToPool failed", undefined, e)
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

// ── Playoff bracket placement editor ────────────────────────────────────────

export interface BracketAssignment {
    matchId: number
    home: number | null
    away: number | null
}

/**
 * teamId -> the tournament_divisions.id of the pool the team played in. This is
 * a team's "home" division; cross-division bracket moves are undone back to it
 * on revert, and unplaced teams fall back to it so final standings stay coherent.
 */
async function getTeamOriginDivisions(
    tournamentId: number
): Promise<Map<number, number>> {
    const rows = await db
        .select({
            teamId: tournamentPoolTeams.team_id,
            divisionId: tournamentPools.division_id
        })
        .from(tournamentPoolTeams)
        .innerJoin(
            tournamentPools,
            eq(tournamentPools.id, tournamentPoolTeams.pool_id)
        )
        .where(eq(tournamentPoolTeams.tournament_id, tournamentId))
    return new Map(rows.map((r) => [r.teamId, r.divisionId]))
}

/**
 * Persists a full snapshot of first-round bracket placements. The payload must
 * cover exactly the editable (round-1 winners) games so unplaced teams can be
 * reconciled. Moving a team into another division's game also updates its final
 * `division_id`; teams left unplaced fall back to their origin pool division.
 */
export const saveBracketPlacements = withAction(
    async (assignments: BracketAssignment[]): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()

        const config = await getTournamentConfig()
        if (!config) return fail("No active tournament.")
        if (config.phase !== "playoffs") {
            return fail("Bracket editing is only available during playoffs.")
        }

        const matches = await db
            .select()
            .from(tournamentMatches)
            .where(
                and(
                    eq(tournamentMatches.tournament_id, config.tournamentId),
                    ne(tournamentMatches.bracket, "pool")
                )
            )

        const hasScores = matches.some(
            (m) =>
                hasAnySetScore(m) ||
                (m.winner_team_id !== null &&
                    m.home_team_id !== null &&
                    m.away_team_id !== null)
        )
        if (hasScores) {
            return fail(
                "Bracket games are already in progress — use Revert to re-seed."
            )
        }

        const editable = matches.filter(
            (m) => m.bracket === "winners" && m.bracket_round === 1
        )
        const editableById = new Map(editable.map((m) => [m.id, m]))
        if (assignments.length !== editable.length) {
            return fail("Placement payload does not match the bracket.")
        }

        const validTeamIds = new Set(
            (
                await db
                    .select({ id: tournamentTeams.id })
                    .from(tournamentTeams)
                    .where(
                        eq(tournamentTeams.tournament_id, config.tournamentId)
                    )
            ).map((t) => t.id)
        )

        const seenTeams = new Set<number>()
        const placedDivision = new Map<number, number>()
        for (const a of assignments) {
            const match = editableById.get(a.matchId)
            if (!match) return fail("Invalid game in placement payload.")
            for (const teamId of [a.home, a.away]) {
                if (teamId === null) continue
                requirePositiveInt(teamId, "team ID")
                if (!validTeamIds.has(teamId)) {
                    return fail("Unknown team in placement payload.")
                }
                if (seenTeams.has(teamId)) {
                    return fail("A team can only be placed in one game.")
                }
                seenTeams.add(teamId)
                placedDivision.set(teamId, match.division_id)
            }
        }

        const originDivisions = await getTeamOriginDivisions(
            config.tournamentId
        )

        await db.transaction(async (tx) => {
            for (const a of assignments) {
                const filled = [a.home, a.away].filter(
                    (x): x is number => x !== null
                )
                // Bye: a lone team auto-wins so progression routes it onward.
                const winner = filled.length === 1 ? filled[0] : null
                await tx
                    .update(tournamentMatches)
                    .set({
                        home_team_id: a.home,
                        away_team_id: a.away,
                        winner_team_id: winner
                    })
                    .where(eq(tournamentMatches.id, a.matchId))
            }

            // Keep each team's final division in sync with where it now plays.
            for (const teamId of validTeamIds) {
                const target =
                    placedDivision.get(teamId) ??
                    originDivisions.get(teamId) ??
                    null
                if (target === null) continue
                await tx
                    .update(tournamentTeams)
                    .set({ division_id: target })
                    .where(eq(tournamentTeams.id, teamId))
            }
        })

        await logAuditEntry({
            userId: session.user.id,
            action: "edit_tournament_bracket",
            entityType: "tournament",
            entityId: config.tournamentId,
            summary: "Edited playoff bracket placements"
        })
        revalidatePath("/dashboard/tournament-pools")
        return ok()
    }
)

/**
 * Discards all manual bracket edits: deletes every bracket match, resets teams
 * to their origin pool division, and re-runs the standard seeding from pool
 * standings — the "properly seeded location".
 */
export const revertBracketSeeding = withAction(
    async (): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()

        const config = await getTournamentConfig()
        if (!config) return fail("No active tournament.")
        if (config.phase !== "playoffs") {
            return fail("Bracket editing is only available during playoffs.")
        }

        const originDivisions = await getTeamOriginDivisions(
            config.tournamentId
        )

        await db.transaction(async (tx) => {
            await tx
                .delete(tournamentMatches)
                .where(
                    and(
                        eq(
                            tournamentMatches.tournament_id,
                            config.tournamentId
                        ),
                        ne(tournamentMatches.bracket, "pool")
                    )
                )
            for (const [teamId, divisionId] of originDivisions) {
                await tx
                    .update(tournamentTeams)
                    .set({ division_id: divisionId })
                    .where(eq(tournamentTeams.id, teamId))
            }
        })

        const result = await seedTournamentBracket(config.tournamentId)
        if (!result.status) return fail(result.message)

        await logAuditEntry({
            userId: session.user.id,
            action: "revert_tournament_bracket",
            entityType: "tournament",
            entityId: config.tournamentId,
            summary: "Reverted playoff bracket to seeded placements"
        })
        revalidatePath("/dashboard/tournament-pools")
        return ok()
    }
)

void isNull
