"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import { divisions, tournamentDivisions, tournaments } from "@/database/schema"
import { asc, desc, eq, ne } from "drizzle-orm"
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
import { isValidSetsFormat, type SetsMode } from "@/lib/tournament-sets"

export interface TournamentDivisionInput {
    // tournament_divisions.id (omitted for newly-added rows)
    id?: number
    // Required: FK to league divisions.id
    divisionId: number
    teamCount: number
    malePerTeam: number
    nonMalePerTeam: number
    teamsAdvancingPerPool: number
    sortOrder: number
}

export interface TournamentMetadataInput {
    code: string
    year: number
    name: string
    tournamentDate: string
    checkinTime: string | null
    firstServeTime: string | null
    address: string | null
    cost: string
    lateCost: string
    lateDate: string | null
    registrationCloseDate: string | null
    rosterLockDate: string | null
    tournamentType: "coed" | "reverse_coed"
    poolSize: number
    eliminationFormat: "single" | "double"
    poolSetsMode: SetsMode
    poolSetsCount: number
    playoffSetsMode: SetsMode
    playoffSetsCount: number
    additionalInfo: string | null
}

/**
 * Validate the pool/playoff sets formats on a metadata payload. Playoffs must
 * be decisive so a bracket match can't tie and stall progression. Returns an
 * error message, or null when valid.
 */
function validateSetsMetadata(m: TournamentMetadataInput): string | null {
    if (!isValidSetsFormat({ mode: m.poolSetsMode, count: m.poolSetsCount })) {
        return "Invalid pool play sets format."
    }
    if (
        !isValidSetsFormat(
            { mode: m.playoffSetsMode, count: m.playoffSetsCount },
            { requireDecisive: true }
        )
    ) {
        return "Invalid playoff sets format — playoffs must produce a winner."
    }
    return null
}

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

        const [t] = await db
            .select()
            .from(tournaments)
            .where(ne(tournaments.phase, "complete"))
            .orderBy(desc(tournaments.id))
            .limit(1)

        if (!t) return ok(null)

        const divs = await db
            .select({
                id: tournamentDivisions.id,
                division_id: tournamentDivisions.division_id,
                division_name: divisions.name,
                division_level: divisions.level,
                team_count: tournamentDivisions.team_count,
                male_per_team: tournamentDivisions.male_per_team,
                non_male_per_team: tournamentDivisions.non_male_per_team,
                teams_advancing_per_pool:
                    tournamentDivisions.teams_advancing_per_pool,
                sort_order: tournamentDivisions.sort_order
            })
            .from(tournamentDivisions)
            .innerJoin(
                divisions,
                eq(divisions.id, tournamentDivisions.division_id)
            )
            .where(eq(tournamentDivisions.tournament_id, t.id))
            .orderBy(asc(tournamentDivisions.sort_order))

        return ok({
            tournamentId: t.id,
            code: t.code,
            year: t.year,
            name: t.name,
            phase: t.phase,
            tournament_date: t.tournament_date,
            checkin_time: t.checkin_time,
            first_serve_time: t.first_serve_time,
            address: t.address,
            cost: t.cost,
            late_cost: t.late_cost,
            late_date: t.late_date,
            registration_close_date: t.registration_close_date,
            roster_lock_date: t.roster_lock_date,
            tournament_type: t.tournament_type,
            pool_size: t.pool_size,
            elimination_format: t.elimination_format,
            pool_sets_mode: t.pool_sets_mode,
            pool_sets_count: t.pool_sets_count,
            playoff_sets_mode: t.playoff_sets_mode,
            playoff_sets_count: t.playoff_sets_count,
            additional_info: t.additional_info,
            divisions: divs
        })
    }
)

export const createTournament = withAction(
    async (
        metadata: TournamentMetadataInput
    ): Promise<ActionResult<{ tournamentId: number }>> => {
        await requireAdmin()
        const session = await requireSession()

        const code = requireNonEmptyString(metadata.code, "code").toLowerCase()
        const name = requireNonEmptyString(metadata.name, "name")
        const year = requirePositiveInt(metadata.year, "year")
        const date = requireNonEmptyString(
            metadata.tournamentDate,
            "tournament date"
        )

        if (
            metadata.tournamentType !== "coed" &&
            metadata.tournamentType !== "reverse_coed"
        ) {
            return fail("Invalid tournament type.")
        }
        if (
            metadata.eliminationFormat !== "single" &&
            metadata.eliminationFormat !== "double"
        ) {
            return fail("Invalid elimination format.")
        }
        const setsError = validateSetsMetadata(metadata)
        if (setsError) return fail(setsError)

        const poolSize = requirePositiveInt(metadata.poolSize, "pool size")

        const [existing] = await db
            .select({ id: tournaments.id })
            .from(tournaments)
            .where(eq(tournaments.code, code))
            .limit(1)
        if (existing) return fail("Tournament code already in use.")

        const [row] = await db
            .insert(tournaments)
            .values({
                code,
                year,
                name,
                phase: "registration_open",
                tournament_date: date,
                checkin_time: metadata.checkinTime || null,
                first_serve_time: metadata.firstServeTime || null,
                address: metadata.address || null,
                cost: metadata.cost || null,
                late_cost: metadata.lateCost || null,
                late_date: metadata.lateDate || null,
                registration_close_date: metadata.registrationCloseDate || null,
                roster_lock_date: metadata.rosterLockDate || null,
                tournament_type: metadata.tournamentType,
                pool_size: poolSize,
                elimination_format: metadata.eliminationFormat,
                pool_sets_mode: metadata.poolSetsMode,
                pool_sets_count: metadata.poolSetsCount,
                playoff_sets_mode: metadata.playoffSetsMode,
                playoff_sets_count: metadata.playoffSetsCount,
                additional_info: metadata.additionalInfo || null
            })
            .returning({ id: tournaments.id })

        await logAuditEntry({
            userId: session.user.id,
            action: "create_tournament",
            entityType: "tournament",
            entityId: row.id,
            summary: `Created tournament ${name} (${code})`
        })

        revalidatePath("/dashboard/tournament-config")
        revalidatePath("/dashboard")
        return ok({ tournamentId: row.id })
    }
)

export const saveTournamentConfig = withAction(
    async (
        tournamentId: number,
        metadata: TournamentMetadataInput,
        divisionsInput: TournamentDivisionInput[]
    ): Promise<ActionResult<void>> => {
        await requireAdmin()
        const session = await requireSession()
        const id = requirePositiveInt(tournamentId, "tournament ID")

        if (
            metadata.tournamentType !== "coed" &&
            metadata.tournamentType !== "reverse_coed"
        ) {
            return fail("Invalid tournament type.")
        }
        if (
            metadata.eliminationFormat !== "single" &&
            metadata.eliminationFormat !== "double"
        ) {
            return fail("Invalid elimination format.")
        }
        const setsError = validateSetsMetadata(metadata)
        if (setsError) return fail(setsError)
        if (divisionsInput.length === 0) {
            return fail("At least one division is required.")
        }

        // Reject duplicate league divisions in a single tournament — the DB
        // unique index would also catch this, but a friendly error is better.
        const seenDivisionIds = new Set<number>()
        for (const d of divisionsInput) {
            if (!Number.isInteger(d.divisionId) || d.divisionId <= 0) {
                return fail("Each row must pick a division.")
            }
            if (seenDivisionIds.has(d.divisionId)) {
                return fail("A division can only be added once per tournament.")
            }
            seenDivisionIds.add(d.divisionId)
            if (d.teamCount <= 0) return fail("Team count must be positive.")
            if (d.malePerTeam < 0 || d.nonMalePerTeam < 0) {
                return fail("Gender counts cannot be negative.")
            }
        }

        await db.transaction(async (tx) => {
            await tx
                .update(tournaments)
                .set({
                    code: metadata.code.toLowerCase(),
                    year: metadata.year,
                    name: metadata.name,
                    tournament_date: metadata.tournamentDate,
                    checkin_time: metadata.checkinTime || null,
                    first_serve_time: metadata.firstServeTime || null,
                    address: metadata.address || null,
                    cost: metadata.cost || null,
                    late_cost: metadata.lateCost || null,
                    late_date: metadata.lateDate || null,
                    registration_close_date:
                        metadata.registrationCloseDate || null,
                    roster_lock_date: metadata.rosterLockDate || null,
                    tournament_type: metadata.tournamentType,
                    pool_size: metadata.poolSize,
                    elimination_format: metadata.eliminationFormat,
                    pool_sets_mode: metadata.poolSetsMode,
                    pool_sets_count: metadata.poolSetsCount,
                    playoff_sets_mode: metadata.playoffSetsMode,
                    playoff_sets_count: metadata.playoffSetsCount,
                    additional_info: metadata.additionalInfo || null
                })
                .where(eq(tournaments.id, id))

            const existing = await tx
                .select({ id: tournamentDivisions.id })
                .from(tournamentDivisions)
                .where(eq(tournamentDivisions.tournament_id, id))
            const keepIds = new Set(
                divisionsInput.filter((d) => d.id).map((d) => d.id as number)
            )
            const toDelete = existing
                .map((r) => r.id)
                .filter((rid) => !keepIds.has(rid))

            for (const d of divisionsInput) {
                if (d.id) {
                    await tx
                        .update(tournamentDivisions)
                        .set({
                            division_id: d.divisionId,
                            team_count: d.teamCount,
                            male_per_team: d.malePerTeam,
                            non_male_per_team: d.nonMalePerTeam,
                            teams_advancing_per_pool: d.teamsAdvancingPerPool,
                            sort_order: d.sortOrder
                        })
                        .where(eq(tournamentDivisions.id, d.id))
                } else {
                    await tx.insert(tournamentDivisions).values({
                        tournament_id: id,
                        division_id: d.divisionId,
                        team_count: d.teamCount,
                        male_per_team: d.malePerTeam,
                        non_male_per_team: d.nonMalePerTeam,
                        teams_advancing_per_pool: d.teamsAdvancingPerPool,
                        sort_order: d.sortOrder
                    })
                }
            }
            for (const rid of toDelete) {
                await tx
                    .delete(tournamentDivisions)
                    .where(eq(tournamentDivisions.id, rid))
            }
        })

        await logAuditEntry({
            userId: session.user.id,
            action: "update_tournament_config",
            entityType: "tournament",
            entityId: id,
            summary: `Updated tournament configuration (${divisionsInput.length} divisions)`
        })

        revalidatePath("/dashboard/tournament-config")
        revalidatePath("/dashboard")
        return ok()
    }
)
