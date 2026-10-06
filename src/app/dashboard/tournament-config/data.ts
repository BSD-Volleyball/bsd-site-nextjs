import "server-only"

import { db } from "@/database/db"
import { divisions } from "@/database/schema"
import { asc, eq } from "drizzle-orm"
import {
    ok,
    requireAdmin,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
import { getTournamentConfig } from "@/lib/tournament-config"

export interface TournamentConfigDivisionRow {
    id: number
    division_id: number
    division_name: string
    division_level: number
    team_count: number
    male_per_team: number
    non_male_per_team: number
    teams_advancing_per_pool: number
    sort_order: number
}

export interface TournamentConfigData {
    tournamentId: number
    code: string
    year: number
    name: string
    phase: string
    tournament_date: string
    checkin_time: string | null
    first_serve_time: string | null
    address: string | null
    cost: string | null
    late_cost: string | null
    late_date: string | null
    registration_close_date: string | null
    roster_lock_date: string | null
    tournament_type: string
    pool_size: number
    elimination_format: string
    pool_sets_mode: string
    pool_sets_count: number
    playoff_sets_mode: string
    playoff_sets_count: number
    additional_info: string | null
    divisions: TournamentConfigDivisionRow[]
}

export interface AvailableDivision {
    id: number
    name: string
    level: number
}

/**
 * League-wide divisions usable as tournament divisions.
 * Limited to active rows so admins don't pick retired divisions.
 */
export const getAvailableDivisions = withAction(
    async (): Promise<ActionResult<AvailableDivision[]>> => {
        await requireAdmin()
        const rows = await db
            .select({
                id: divisions.id,
                name: divisions.name,
                level: divisions.level
            })
            .from(divisions)
            .where(eq(divisions.active, true))
            .orderBy(asc(divisions.level))
        return ok(rows)
    }
)

export const getTournamentConfigData = withAction(
    async (): Promise<ActionResult<TournamentConfigData | null>> => {
        await requireAdmin()

        const config = await getTournamentConfig()
        if (!config) return ok(null)

        return ok({
            tournamentId: config.tournamentId,
            code: config.code,
            year: config.year,
            name: config.name,
            phase: config.phase,
            tournament_date: config.tournamentDate,
            checkin_time: config.checkinTime,
            first_serve_time: config.firstServeTime,
            address: config.address,
            cost: config.cost || null,
            late_cost: config.lateCost || null,
            late_date: config.lateDate,
            registration_close_date: config.registrationCloseDate,
            roster_lock_date: config.rosterLockDate,
            tournament_type: config.tournamentType,
            pool_size: config.poolSize,
            elimination_format: config.eliminationFormat,
            pool_sets_mode: config.poolSets.mode,
            pool_sets_count: config.poolSets.count,
            playoff_sets_mode: config.playoffSets.mode,
            playoff_sets_count: config.playoffSets.count,
            additional_info: config.additionalInfo,
            divisions: config.divisions.map((d) => ({
                id: d.id,
                division_id: d.divisionId,
                division_name: d.divisionName,
                division_level: d.divisionLevel,
                team_count: d.teamCount,
                male_per_team: d.malePerTeam,
                non_male_per_team: d.nonMalePerTeam,
                teams_advancing_per_pool: d.teamsAdvancingPerPool,
                sort_order: d.sortOrder
            }))
        })
    }
)
