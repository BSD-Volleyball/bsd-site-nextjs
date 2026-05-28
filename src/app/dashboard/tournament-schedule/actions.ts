"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    tournamentMatches,
    tournamentPoolTeams,
    tournamentPools,
    tournamentTeams
} from "@/database/schema"
import { and, asc, eq, ne } from "drizzle-orm"
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

export interface ScheduleRow {
    matchId: number
    poolId: number | null
    poolName: string | null
    divisionName: string
    bracket: string
    bracketRound: number | null
    homeTeamId: number | null
    homeTeamName: string | null
    awayTeamId: number | null
    awayTeamName: string | null
    workTeamId: number | null
    workTeamName: string | null
    court: number | null
    startTime: string | null
    candidateWorkTeams: { id: number; name: string }[]
}

export interface ScheduleView {
    tournamentId: number
    tournamentName: string
    rows: ScheduleRow[]
}

export const getScheduleView = withAction(
    async (): Promise<ActionResult<ScheduleView | null>> => {
        await requireAdmin()
        const config = await getTournamentConfig()
        if (!config) return ok(null)

        const matches = await db
            .select()
            .from(tournamentMatches)
            .where(eq(tournamentMatches.tournament_id, config.tournamentId))
            .orderBy(
                asc(tournamentMatches.bracket),
                asc(tournamentMatches.bracket_round),
                asc(tournamentMatches.bracket_slot)
            )

        const teams = await db
            .select({
                id: tournamentTeams.id,
                name: tournamentTeams.name
            })
            .from(tournamentTeams)
            .where(eq(tournamentTeams.tournament_id, config.tournamentId))
        const teamName = new Map(teams.map((t) => [t.id, t.name]))

        const pools = await db
            .select()
            .from(tournamentPools)
            .where(eq(tournamentPools.tournament_id, config.tournamentId))
        const poolMap = new Map(pools.map((p) => [p.id, p]))

        const poolTeams = await db
            .select()
            .from(tournamentPoolTeams)
            .where(eq(tournamentPoolTeams.tournament_id, config.tournamentId))
        const teamsByPool = new Map<number, number[]>()
        for (const pt of poolTeams) {
            const arr = teamsByPool.get(pt.pool_id) ?? []
            arr.push(pt.team_id)
            teamsByPool.set(pt.pool_id, arr)
        }

        const divisionName = new Map(
            config.divisions.map((d) => [d.id, d.divisionName])
        )

        const rows: ScheduleRow[] = matches.map((m) => {
            const pool = m.pool_id ? poolMap.get(m.pool_id) : null

            // Candidate work teams for pool matches: teams in the same pool
            // that aren't playing this match. For bracket matches, only admin
            // override (no rotation defaults).
            let candidates: { id: number; name: string }[] = []
            if (m.pool_id) {
                const poolTeamIds = teamsByPool.get(m.pool_id) ?? []
                candidates = poolTeamIds
                    .filter(
                        (tid) =>
                            tid !== m.home_team_id && tid !== m.away_team_id
                    )
                    .map((tid) => ({
                        id: tid,
                        name: teamName.get(tid) ?? `Team ${tid}`
                    }))
            } else {
                candidates = teams
                    .filter(
                        (t) =>
                            t.id !== m.home_team_id && t.id !== m.away_team_id
                    )
                    .map((t) => ({ id: t.id, name: t.name }))
            }

            return {
                matchId: m.id,
                poolId: m.pool_id,
                poolName: pool?.name ?? null,
                divisionName: divisionName.get(m.division_id) ?? "—",
                bracket: m.bracket,
                bracketRound: m.bracket_round,
                homeTeamId: m.home_team_id,
                homeTeamName:
                    m.home_team_id !== null
                        ? (teamName.get(m.home_team_id) ?? null)
                        : null,
                awayTeamId: m.away_team_id,
                awayTeamName:
                    m.away_team_id !== null
                        ? (teamName.get(m.away_team_id) ?? null)
                        : null,
                workTeamId: m.work_team_id,
                workTeamName:
                    m.work_team_id !== null
                        ? (teamName.get(m.work_team_id) ?? null)
                        : null,
                court: m.court,
                startTime: m.start_time,
                candidateWorkTeams: candidates
            }
        })

        return ok({
            tournamentId: config.tournamentId,
            tournamentName: config.name,
            rows
        })
    }
)

export const updateScheduleRow = withAction(
    async (
        matchId: number,
        update: {
            court: number | null
            startTime: string | null
            workTeamId: number | null
        }
    ): Promise<ActionResult<void>> => {
        const session = await requireSession()
        await requireAdmin()
        const id = requirePositiveInt(matchId, "match ID")

        const [match] = await db
            .select()
            .from(tournamentMatches)
            .where(eq(tournamentMatches.id, id))
            .limit(1)
        if (!match) return fail("Match not found.")

        // Work team must not be one of the playing teams.
        if (
            update.workTeamId !== null &&
            (update.workTeamId === match.home_team_id ||
                update.workTeamId === match.away_team_id)
        ) {
            return fail("Work team cannot be one of the playing teams.")
        }

        await db
            .update(tournamentMatches)
            .set({
                court: update.court,
                start_time: update.startTime,
                work_team_id: update.workTeamId
            })
            .where(eq(tournamentMatches.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "update_tournament_schedule",
            entityType: "tournament_match",
            entityId: id,
            summary: `Updated schedule (court ${update.court ?? "—"}, time ${update.startTime ?? "—"}, work team ${update.workTeamId ?? "—"})`
        })

        revalidatePath("/dashboard/tournament-schedule")
        return ok()
    }
)

void and
void ne
