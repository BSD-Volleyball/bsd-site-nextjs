import "server-only"

import { formatPlayerName } from "@/lib/utils"
import { db } from "@/database/db"
import {
    tournamentMatches,
    tournamentPoolTeams,
    tournamentPools,
    tournamentTeams,
    users
} from "@/database/schema"
import { and, asc, eq, inArray, ne } from "drizzle-orm"
import {
    ok,
    requireAdmin,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import { getTournamentConfig } from "@/lib/tournament-config"
import { getPoolStandings } from "@/lib/tournament-standings"

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

interface SetScoreRow {
    home_set1_score: number | null
    away_set1_score: number | null
    home_set2_score: number | null
    away_set2_score: number | null
    home_set3_score: number | null
    away_set3_score: number | null
}

export function hasAnySetScore(m: SetScoreRow): boolean {
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
