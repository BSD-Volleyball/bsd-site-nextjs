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
import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import {
    fail,
    ok,
    requireAdmin,
    requireNonEmptyString,
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
import type { DivisionPlacements } from "@/components/tournament/tournament-placements-card"

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

export const createTournament = withAction(
    async (input: {
        name: string
        year: number
        code: string
    }): Promise<ActionResult<{ tournamentId: number }>> => {
        await requireAdmin()
        const session = await requireSession()

        const name = requireNonEmptyString(input.name, "name")
        const code = requireNonEmptyString(input.code, "code").toLowerCase()
        if (
            !Number.isInteger(input.year) ||
            input.year < 2000 ||
            input.year > 2100
        ) {
            return fail("Enter a valid year.")
        }

        // Only one tournament may run at a time. Any non-complete row (not
        // just the newest) blocks creation — a stuck older tournament must be
        // completed or ended early before a new one can exist.
        const [active] = await db
            .select({ name: tournaments.name, year: tournaments.year })
            .from(tournaments)
            .where(ne(tournaments.phase, "complete"))
            .limit(1)
        if (active) {
            return fail(
                `Cannot create a new tournament while "${active.name} (${active.year})" is not Complete. Finish it with the phase controls or End Tournament Early.`
            )
        }

        const [existing] = await db
            .select({ id: tournaments.id })
            .from(tournaments)
            .where(eq(tournaments.code, code))
            .limit(1)
        if (existing) return fail("Tournament code already in use.")

        // Clone source: the newest tournament (complete, per the guard).
        // Dates are cloned verbatim on purpose — stale past dates fail closed
        // (registration reads as closed) until the admin sets real ones in
        // Tournament Configuration, whereas nulling registration_close_date
        // would instantly open registration at the stale price.
        const [source] = await db
            .select()
            .from(tournaments)
            .orderBy(desc(tournaments.id))
            .limit(1)

        const todayEt = new Date().toLocaleDateString("en-CA", {
            timeZone: "America/New_York"
        })

        const newId = await db.transaction(async (tx) => {
            const [row] = await tx
                .insert(tournaments)
                .values({
                    code,
                    year: input.year,
                    name,
                    tournament_date: source?.tournament_date ?? todayEt,
                    checkin_time: source?.checkin_time ?? null,
                    first_serve_time: source?.first_serve_time ?? null,
                    address: source?.address ?? null,
                    cost: source?.cost ?? null,
                    late_cost: source?.late_cost ?? null,
                    late_date: source?.late_date ?? null,
                    registration_close_date:
                        source?.registration_close_date ?? null,
                    roster_lock_date: source?.roster_lock_date ?? null,
                    tournament_type: source?.tournament_type ?? "coed",
                    pool_size: source?.pool_size ?? 4,
                    elimination_format: source?.elimination_format ?? "single",
                    pool_sets_mode: source?.pool_sets_mode ?? "exact",
                    pool_sets_count: source?.pool_sets_count ?? 2,
                    playoff_sets_mode: source?.playoff_sets_mode ?? "best_of",
                    playoff_sets_count: source?.playoff_sets_count ?? 3,
                    additional_info: source?.additional_info ?? null
                })
                .returning({ id: tournaments.id })

            if (source) {
                const sourceDivisions = await tx
                    .select()
                    .from(tournamentDivisions)
                    .where(eq(tournamentDivisions.tournament_id, source.id))
                if (sourceDivisions.length > 0) {
                    await tx.insert(tournamentDivisions).values(
                        sourceDivisions.map((d) => ({
                            tournament_id: row.id,
                            division_id: d.division_id,
                            team_count: d.team_count,
                            male_per_team: d.male_per_team,
                            non_male_per_team: d.non_male_per_team,
                            teams_advancing_per_pool:
                                d.teams_advancing_per_pool,
                            sort_order: d.sort_order
                        }))
                    )
                }
            }

            return row.id
        })

        await logAuditEntry({
            userId: session.user.id,
            action: "create_tournament",
            entityType: "tournament",
            entityId: newId,
            summary: source
                ? `Created tournament ${name} (${code}), cloned config from ${source.name} (${source.year})`
                : `Created tournament ${name} (${code})`
        })

        revalidatePath("/dashboard/tournament-control")
        revalidatePath("/dashboard/tournament-config")
        revalidatePath("/dashboard")
        revalidatePath("/")
        revalidatePath(`/tournament/${code}`)

        return ok(
            { tournamentId: newId },
            `${name} created. Edit dates, costs, and divisions in Tournament Configuration.`
        )
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

    // Batch: one team fetch for all pools, one atomic multi-row insert for
    // every generated match (previously one query per pool + one insert per
    // match, with partial-failure risk).
    const poolTeams =
        pools.length > 0
            ? await db
                  .select({
                      poolId: tournamentPoolTeams.pool_id,
                      teamId: tournamentPoolTeams.team_id
                  })
                  .from(tournamentPoolTeams)
                  .where(
                      inArray(
                          tournamentPoolTeams.pool_id,
                          pools.map((p) => p.id)
                      )
                  )
            : []

    const teamIdsByPool = new Map<number, number[]>()
    for (const row of poolTeams) {
        teamIdsByPool.set(row.poolId, [
            ...(teamIdsByPool.get(row.poolId) ?? []),
            row.teamId
        ])
    }

    const rows: (typeof tournamentMatches.$inferInsert)[] = []
    for (const pool of pools) {
        const teamIds = teamIdsByPool.get(pool.id) ?? []
        if (teamIds.length < 2) continue

        for (const [i, j] of roundRobinPairs(teamIds.length)) {
            rows.push({
                tournament_id: tournamentId,
                division_id: pool.division_id,
                pool_id: pool.id,
                bracket: "pool",
                home_team_id: teamIds[i],
                away_team_id: teamIds[j]
            })
        }
    }

    if (rows.length > 0) {
        await db.insert(tournamentMatches).values(rows)
    }

    return { ok: true, matchCount: rows.length }
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
