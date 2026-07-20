"use server"

import { formatPlayerName } from "@/lib/utils"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    tournamentMatches,
    tournamentPoolTeams,
    tournamentPools,
    tournamentTeams,
    users
} from "@/database/schema"
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm"
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
import { getPoolStandings } from "@/lib/tournament-standings"
import { seedTournamentBracket } from "@/lib/tournament-brackets"
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

// ── Playoff bracket placement editor ────────────────────────────────────────

export interface PlaceableTeam {
    teamId: number
    name: string
    // e.g. "BB · Pool 1 #1" — origin division + pool + USAV pool rank.
    annotation: string
    originDivisionId: number | null
    originDivisionLevel: number
    poolName: string | null
    poolRank: number | null
    advanced: boolean
}

export interface BracketGame {
    matchId: number
    divisionId: number
    round: number
    slot: number
    home: number | null
    away: number | null
}

export interface BracketDivisionView {
    divisionId: number
    divisionName: string
    games: BracketGame[]
}

export interface BracketEditorView {
    tournamentId: number
    tournamentName: string
    eliminationFormat: "single" | "double"
    divisions: BracketDivisionView[]
    placeableTeams: PlaceableTeam[]
    bracketHasScores: boolean
}

export interface BracketAssignment {
    matchId: number
    home: number | null
    away: number | null
}

interface SetScoreRow {
    home_set1_score: number | null
    away_set1_score: number | null
    home_set2_score: number | null
    away_set2_score: number | null
    home_set3_score: number | null
    away_set3_score: number | null
}

function hasAnySetScore(m: SetScoreRow): boolean {
    return (
        m.home_set1_score !== null ||
        m.away_set1_score !== null ||
        m.home_set2_score !== null ||
        m.away_set2_score !== null ||
        m.home_set3_score !== null ||
        m.away_set3_score !== null
    )
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
 * Loads the playoff bracket for interactive placement editing. Only meaningful
 * while the tournament is in the `playoffs` phase — returns null otherwise so
 * the page can fall back to the pre-playoff pool manager.
 */
export const getTournamentBracketEditorView = withAction(
    async (): Promise<ActionResult<BracketEditorView | null>> => {
        await requireAdmin()
        const config = await getTournamentConfig()
        if (!config || config.phase !== "playoffs") return ok(null)

        const teams = await db
            .select({
                id: tournamentTeams.id,
                name: tournamentTeams.name
            })
            .from(tournamentTeams)
            .where(eq(tournamentTeams.tournament_id, config.tournamentId))

        const pools = await db
            .select()
            .from(tournamentPools)
            .where(eq(tournamentPools.tournament_id, config.tournamentId))
            .orderBy(asc(tournamentPools.sort_order))

        // Per-team annotation from pool standings (origin division + rank).
        const meta = new Map<number, PlaceableTeam>()
        for (const pool of pools) {
            const division = config.divisions.find(
                (d) => d.id === pool.division_id
            )
            const standings = await getPoolStandings(pool.id)
            standings.forEach((row, i) => {
                const rank = i + 1
                const advanced =
                    division !== undefined &&
                    rank <= division.teamsAdvancingPerPool
                meta.set(row.teamId, {
                    teamId: row.teamId,
                    name: row.teamName,
                    annotation: `${division?.divisionName ?? "?"} · ${pool.name} #${rank}`,
                    originDivisionId: pool.division_id,
                    originDivisionLevel: division?.divisionLevel ?? 0,
                    poolName: pool.name,
                    poolRank: rank,
                    advanced
                })
            })
        }

        const placeableTeams: PlaceableTeam[] = teams
            .map(
                (t): PlaceableTeam =>
                    meta.get(t.id) ?? {
                        teamId: t.id,
                        name: t.name,
                        annotation: "unpooled",
                        originDivisionId: null,
                        originDivisionLevel: 0,
                        poolName: null,
                        poolRank: null,
                        advanced: false
                    }
            )
            .sort(
                (a, b) =>
                    Number(b.advanced) - Number(a.advanced) ||
                    a.originDivisionLevel - b.originDivisionLevel ||
                    (a.poolName ?? "").localeCompare(b.poolName ?? "") ||
                    (a.poolRank ?? 0) - (b.poolRank ?? 0) ||
                    a.name.localeCompare(b.name)
            )

        const matches = await db
            .select()
            .from(tournamentMatches)
            .where(
                and(
                    eq(tournamentMatches.tournament_id, config.tournamentId),
                    ne(tournamentMatches.bracket, "pool")
                )
            )

        const bracketHasScores = matches.some(
            (m) =>
                hasAnySetScore(m) ||
                (m.winner_team_id !== null &&
                    m.home_team_id !== null &&
                    m.away_team_id !== null)
        )

        const divisions: BracketDivisionView[] = config.divisions.map((d) => ({
            divisionId: d.id,
            divisionName: d.divisionName,
            games: matches
                .filter(
                    (m) =>
                        m.division_id === d.id &&
                        m.bracket === "winners" &&
                        m.bracket_round === 1
                )
                .sort((a, b) => (a.bracket_slot ?? 0) - (b.bracket_slot ?? 0))
                .map((m) => ({
                    matchId: m.id,
                    divisionId: d.id,
                    round: m.bracket_round ?? 1,
                    slot: m.bracket_slot ?? 0,
                    home: m.home_team_id,
                    away: m.away_team_id
                }))
        }))

        return ok({
            tournamentId: config.tournamentId,
            tournamentName: config.name,
            eliminationFormat: config.eliminationFormat,
            divisions,
            placeableTeams,
            bracketHasScores
        })
    }
)

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
