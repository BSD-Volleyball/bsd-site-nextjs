"use server"

import { revalidatePath, updateTag } from "next/cache"
import { TOURNAMENT_CONFIG_TAG } from "@/next/public-cache"
import { db } from "@/database/db"
import {
    tournamentDivisions,
    tournamentPlacements,
    tournamentPools,
    tournaments
} from "@/database/schema"
import { eq, inArray } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { CONFIRM_DESTRUCTIVE_SUFFIX } from "@/lib/confirm-destructive"
import {
    fail,
    ok,
    requireAdmin,
    requirePositiveInt,
    requireSession,
    withAction,
    type ActionResult
} from "@/next/action-helpers"
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

export interface SaveTournamentConfigOptions {
    /**
     * Permit removing a division that already has pools or recorded
     * placements. Without it such a save is refused, because the delete
     * cascades through pools to their matches and team assignments.
     */
    confirmDeletions?: boolean
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

export const saveTournamentConfig = withAction(
    async (
        tournamentId: number,
        metadata: TournamentMetadataInput,
        divisionsInput: TournamentDivisionInput[],
        options: SaveTournamentConfigOptions = {}
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

        // Removing a division cascades: tournament_pools (and through them
        // tournament_matches and tournament_pool_teams) plus
        // tournament_placements all go with it, silently. Resolve the removals
        // up front so a destructive save has to be intentional.
        const existingDivisions = await db
            .select({
                id: tournamentDivisions.id,
                divisionId: tournamentDivisions.division_id
            })
            .from(tournamentDivisions)
            .where(eq(tournamentDivisions.tournament_id, id))
        const keepIds = new Set(
            divisionsInput.filter((d) => d.id).map((d) => d.id as number)
        )
        const removedDivisionIds = existingDivisions
            .map((r) => r.id)
            .filter((rid) => !keepIds.has(rid))

        if (removedDivisionIds.length > 0 && !options.confirmDeletions) {
            const [pools, placements] = await Promise.all([
                db
                    .select({ id: tournamentPools.id })
                    .from(tournamentPools)
                    .where(
                        inArray(tournamentPools.division_id, removedDivisionIds)
                    ),
                db
                    .select({ id: tournamentPlacements.id })
                    .from(tournamentPlacements)
                    .where(
                        inArray(
                            tournamentPlacements.division_id,
                            removedDivisionIds
                        )
                    )
            ])
            if (pools.length > 0 || placements.length > 0) {
                const parts = [
                    pools.length > 0 &&
                        `${pools.length} pool${pools.length === 1 ? "" : "s"} (with their matches and team assignments)`,
                    placements.length > 0 &&
                        `${placements.length} recorded placement${placements.length === 1 ? "" : "s"}`
                ].filter(Boolean)
                return fail(
                    `Removing that division would permanently delete ${parts.join(" and ")}. ${CONFIRM_DESTRUCTIVE_SUFFIX}`
                )
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
            for (const rid of removedDivisionIds) {
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
        updateTag(TOURNAMENT_CONFIG_TAG)
        return ok()
    }
)
