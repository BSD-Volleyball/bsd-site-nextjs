"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    divisions,
    tournamentDivisions,
    tournamentMatches,
    tournamentPlacements,
    tournamentPoolTeams,
    tournamentPools,
    tournamentTeams,
    tournaments
} from "@/database/schema"
import { and, asc, desc, eq, isNull, or } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import {
    fail,
    ok,
    requireAdmin,
    requirePositiveInt,
    requireSession,
    withAction,
    type ActionResult
} from "@/lib/action-helpers"
import {
    TOURNAMENT_PHASE_CONFIG,
    isValidTournamentPhaseRevert,
    isValidTournamentPhaseTransition,
    type TournamentPhase
} from "@/lib/tournament-phases"
import { seedTournamentBracket } from "@/lib/tournament-brackets"
import { finalizeTournamentResults } from "@/lib/tournament-final-standings"

export interface TournamentPhaseData {
    tournamentId: number
    label: string
    phase: TournamentPhase
}

export const getCurrentTournamentPhaseData = withAction(
    async (): Promise<ActionResult<TournamentPhaseData | null>> => {
        await requireAdmin()
        const [t] = await db
            .select({
                id: tournaments.id,
                name: tournaments.name,
                year: tournaments.year,
                phase: tournaments.phase
            })
            .from(tournaments)
            .orderBy(desc(tournaments.id))
            .limit(1)

        if (!t) return ok(null)

        return ok({
            tournamentId: t.id,
            label: `${t.name} (${t.year})`,
            phase: t.phase as TournamentPhase
        })
    }
)

/**
 * Round-robin match generator: for n teams, produces every pair (i,j) once.
 * Returns pairs by team index within the input list — caller maps to team IDs.
 */
function roundRobinPairs(n: number): Array<[number, number]> {
    const pairs: Array<[number, number]> = []
    for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
            pairs.push([i, j])
        }
    }
    return pairs
}

async function validateAndGeneratePoolMatches(
    tournamentId: number
): Promise<{ ok: true; matchCount: number } | { ok: false; message: string }> {
    // Every team must have a final division assigned.
    const teamsMissingDivision = await db
        .select({ id: tournamentTeams.id, name: tournamentTeams.name })
        .from(tournamentTeams)
        .where(
            and(
                eq(tournamentTeams.tournament_id, tournamentId),
                isNull(tournamentTeams.division_id)
            )
        )
    if (teamsMissingDivision.length > 0) {
        const names = teamsMissingDivision
            .map((t) => t.name)
            .slice(0, 3)
            .join(", ")
        const extra =
            teamsMissingDivision.length > 3
                ? ` and ${teamsMissingDivision.length - 3} more`
                : ""
        return {
            ok: false,
            message: `Cannot advance: ${teamsMissingDivision.length} team(s) have no final division assigned (${names}${extra}).`
        }
    }

    // Every team must be in exactly one pool.
    const allTeams = await db
        .select({ id: tournamentTeams.id, name: tournamentTeams.name })
        .from(tournamentTeams)
        .where(eq(tournamentTeams.tournament_id, tournamentId))
    const pooled = await db
        .select({ teamId: tournamentPoolTeams.team_id })
        .from(tournamentPoolTeams)
        .where(eq(tournamentPoolTeams.tournament_id, tournamentId))
    const pooledIds = new Set(pooled.map((p) => p.teamId))
    const unpooled = allTeams.filter((t) => !pooledIds.has(t.id))
    if (unpooled.length > 0) {
        const names = unpooled
            .map((t) => t.name)
            .slice(0, 3)
            .join(", ")
        const extra =
            unpooled.length > 3 ? ` and ${unpooled.length - 3} more` : ""
        return {
            ok: false,
            message: `Cannot advance: ${unpooled.length} team(s) not assigned to a pool (${names}${extra}).`
        }
    }

    // Don't double-generate.
    const [existing] = await db
        .select({ id: tournamentMatches.id })
        .from(tournamentMatches)
        .where(
            and(
                eq(tournamentMatches.tournament_id, tournamentId),
                eq(tournamentMatches.bracket, "pool")
            )
        )
        .limit(1)
    if (existing) {
        return { ok: true, matchCount: 0 }
    }

    // Generate round-robin per pool.
    const pools = await db
        .select()
        .from(tournamentPools)
        .where(eq(tournamentPools.tournament_id, tournamentId))
        .orderBy(asc(tournamentPools.sort_order))

    let inserted = 0
    for (const pool of pools) {
        const teams = await db
            .select({ id: tournamentPoolTeams.team_id })
            .from(tournamentPoolTeams)
            .where(eq(tournamentPoolTeams.pool_id, pool.id))
        const teamIds = teams.map((t) => t.id)
        if (teamIds.length < 2) continue

        const pairs = roundRobinPairs(teamIds.length)
        for (const [i, j] of pairs) {
            await db.insert(tournamentMatches).values({
                tournament_id: tournamentId,
                division_id: pool.division_id,
                pool_id: pool.id,
                bracket: "pool",
                home_team_id: teamIds[i],
                away_team_id: teamIds[j]
            })
            inserted++
        }
    }

    return { ok: true, matchCount: inserted }
}

async function validateAllPoolScoresEntered(
    tournamentId: number
): Promise<true | string> {
    const incomplete = await db
        .select({
            id: tournamentMatches.id,
            divisionId: tournamentMatches.division_id
        })
        .from(tournamentMatches)
        .where(
            and(
                eq(tournamentMatches.tournament_id, tournamentId),
                eq(tournamentMatches.bracket, "pool"),
                or(
                    isNull(tournamentMatches.home_set1_score),
                    isNull(tournamentMatches.away_set1_score),
                    isNull(tournamentMatches.home_set2_score),
                    isNull(tournamentMatches.away_set2_score)
                )
            )
        )
    if (incomplete.length === 0) return true
    return `Cannot advance to Playoffs: ${incomplete.length} pool match(es) missing scores.`
}

export const advanceTournamentPhase = withAction(
    async (
        tournamentId: number,
        targetPhase: TournamentPhase
    ): Promise<ActionResult<{ message: string }>> => {
        await requireAdmin()
        const session = await requireSession()
        const id = requirePositiveInt(tournamentId, "tournament ID")

        const [t] = await db
            .select({ id: tournaments.id, phase: tournaments.phase })
            .from(tournaments)
            .where(eq(tournaments.id, id))
            .limit(1)
        if (!t) return fail("Tournament not found.")

        const currentPhase = t.phase as TournamentPhase
        if (!isValidTournamentPhaseTransition(currentPhase, targetPhase)) {
            return fail(
                `Cannot advance from "${TOURNAMENT_PHASE_CONFIG[currentPhase].label}" to "${TOURNAMENT_PHASE_CONFIG[targetPhase].label}".`
            )
        }

        let sideEffectSummary = ""

        if (targetPhase === "pool_play") {
            const result = await validateAndGeneratePoolMatches(id)
            if (!result.ok) return fail(result.message)
            if (result.matchCount > 0) {
                sideEffectSummary = ` Generated ${result.matchCount} pool match(es).`
            }
        }

        if (targetPhase === "playoffs") {
            const scoresOk = await validateAllPoolScoresEntered(id)
            if (scoresOk !== true) return fail(scoresOk)
            const seedResult = await seedTournamentBracket(id)
            if (!seedResult.status) return fail(seedResult.message)
            sideEffectSummary = ` Seeded ${seedResult.divisionsSeeded} division(s).`
        }

        if (targetPhase === "complete") {
            const { divisionsPlaced } = await finalizeTournamentResults(id)
            sideEffectSummary = ` Recorded final placements for ${divisionsPlaced} division(s).`
        }

        await db
            .update(tournaments)
            .set({ phase: targetPhase })
            .where(eq(tournaments.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "advance_tournament_phase",
            entityType: "tournament",
            entityId: id,
            summary: `Advanced tournament from "${TOURNAMENT_PHASE_CONFIG[currentPhase].label}" to "${TOURNAMENT_PHASE_CONFIG[targetPhase].label}".${sideEffectSummary}`
        })

        revalidatePath("/dashboard/tournament-control")
        revalidatePath("/dashboard")
        return ok({
            message: `Tournament advanced to "${TOURNAMENT_PHASE_CONFIG[targetPhase].label}".${sideEffectSummary}`
        })
    }
)

export const revertTournamentPhase = withAction(
    async (
        tournamentId: number,
        targetPhase: TournamentPhase
    ): Promise<ActionResult<{ message: string }>> => {
        await requireAdmin()
        const session = await requireSession()
        const id = requirePositiveInt(tournamentId, "tournament ID")

        const [t] = await db
            .select({ id: tournaments.id, phase: tournaments.phase })
            .from(tournaments)
            .where(eq(tournaments.id, id))
            .limit(1)
        if (!t) return fail("Tournament not found.")

        const currentPhase = t.phase as TournamentPhase

        // Reverting out of "complete" undoes the finalization: drop recorded
        // placements and return to the phase the tournament was actually in. That
        // is "playoffs" if a bracket was ever seeded, otherwise "pool_play" (an
        // early end straight from pool play never created bracket matches).
        if (currentPhase === "complete") {
            const [bracketMatch] = await db
                .select({ id: tournamentMatches.id })
                .from(tournamentMatches)
                .where(
                    and(
                        eq(tournamentMatches.tournament_id, id),
                        or(
                            eq(tournamentMatches.bracket, "winners"),
                            eq(tournamentMatches.bracket, "losers"),
                            eq(tournamentMatches.bracket, "final")
                        )
                    )
                )
                .limit(1)
            const priorPhase: TournamentPhase = bracketMatch
                ? "playoffs"
                : "pool_play"

            await db.transaction(async (tx) => {
                await tx
                    .delete(tournamentPlacements)
                    .where(eq(tournamentPlacements.tournament_id, id))
                await tx
                    .update(tournaments)
                    .set({ phase: priorPhase })
                    .where(eq(tournaments.id, id))
            })

            await logAuditEntry({
                userId: session.user.id,
                action: "revert_tournament_phase",
                entityType: "tournament",
                entityId: id,
                summary: `Reverted tournament from "Complete" to "${TOURNAMENT_PHASE_CONFIG[priorPhase].label}" and cleared recorded placements.`
            })

            revalidatePath("/dashboard/tournament-control")
            revalidatePath("/dashboard")
            return ok({
                message: `Tournament reverted to "${TOURNAMENT_PHASE_CONFIG[priorPhase].label}"; recorded placements cleared.`
            })
        }

        if (!isValidTournamentPhaseRevert(currentPhase, targetPhase)) {
            return fail(
                `Cannot revert from "${TOURNAMENT_PHASE_CONFIG[currentPhase].label}" to "${TOURNAMENT_PHASE_CONFIG[targetPhase].label}".`
            )
        }

        await db
            .update(tournaments)
            .set({ phase: targetPhase })
            .where(eq(tournaments.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "revert_tournament_phase",
            entityType: "tournament",
            entityId: id,
            summary: `Reverted tournament from "${TOURNAMENT_PHASE_CONFIG[currentPhase].label}" to "${TOURNAMENT_PHASE_CONFIG[targetPhase].label}".`
        })

        revalidatePath("/dashboard/tournament-control")
        return ok({
            message: `Tournament reverted to "${TOURNAMENT_PHASE_CONFIG[targetPhase].label}".`
        })
    }
)

/**
 * End a tournament early (e.g. weather cancellation). Jumps straight to "complete"
 * from pool play or playoffs — a transition the normal linear phase machine
 * deliberately disallows — recording final placements from whatever data exists.
 */
export const endTournamentEarly = withAction(
    async (
        tournamentId: number
    ): Promise<ActionResult<{ message: string }>> => {
        await requireAdmin()
        const session = await requireSession()
        const id = requirePositiveInt(tournamentId, "tournament ID")

        const [t] = await db
            .select({ id: tournaments.id, phase: tournaments.phase })
            .from(tournaments)
            .where(eq(tournaments.id, id))
            .limit(1)
        if (!t) return fail("Tournament not found.")

        const currentPhase = t.phase as TournamentPhase
        if (currentPhase !== "pool_play" && currentPhase !== "playoffs") {
            return fail(
                `Can only end a tournament early during Pool Play or Playoffs (currently "${TOURNAMENT_PHASE_CONFIG[currentPhase].label}").`
            )
        }

        const { divisionsPlaced } = await finalizeTournamentResults(id)

        await db
            .update(tournaments)
            .set({ phase: "complete" })
            .where(eq(tournaments.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "end_tournament_early",
            entityType: "tournament",
            entityId: id,
            summary: `Ended tournament early from "${TOURNAMENT_PHASE_CONFIG[currentPhase].label}"; recorded final placements for ${divisionsPlaced} division(s).`
        })

        revalidatePath("/dashboard/tournament-control")
        revalidatePath("/dashboard")
        return ok({
            message: `Tournament ended early. Recorded final placements for ${divisionsPlaced} division(s).`
        })
    }
)

export interface DivisionPlacements {
    divisionId: number
    divisionName: string
    teams: Array<{ teamId: number; teamName: string; place: number }>
}

/**
 * Read recorded final placements for a tournament, grouped by division and ordered
 * by division level then finishing place. Admin-gated.
 */
export const getTournamentPlacements = withAction(
    async (
        tournamentId: number
    ): Promise<ActionResult<DivisionPlacements[]>> => {
        await requireAdmin()
        const id = requirePositiveInt(tournamentId, "tournament ID")

        const rows = await db
            .select({
                divisionId: tournamentPlacements.division_id,
                divisionName: divisions.name,
                divisionLevel: divisions.level,
                teamId: tournamentPlacements.team_id,
                teamName: tournamentTeams.name,
                place: tournamentPlacements.place
            })
            .from(tournamentPlacements)
            .innerJoin(
                tournamentTeams,
                eq(tournamentTeams.id, tournamentPlacements.team_id)
            )
            .innerJoin(
                tournamentDivisions,
                eq(tournamentDivisions.id, tournamentPlacements.division_id)
            )
            .innerJoin(
                divisions,
                eq(divisions.id, tournamentDivisions.division_id)
            )
            .where(eq(tournamentPlacements.tournament_id, id))
            .orderBy(asc(divisions.level), asc(tournamentPlacements.place))

        const byDivision = new Map<number, DivisionPlacements>()
        for (const r of rows) {
            let group = byDivision.get(r.divisionId)
            if (!group) {
                group = {
                    divisionId: r.divisionId,
                    divisionName: r.divisionName,
                    teams: []
                }
                byDivision.set(r.divisionId, group)
            }
            group.teams.push({
                teamId: r.teamId,
                teamName: r.teamName,
                place: r.place
            })
        }

        return ok([...byDivision.values()])
    }
)
