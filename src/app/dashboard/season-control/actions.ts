"use server"

import { db } from "@/database/db"
import { seasons } from "@/database/schema"
import { eq, desc } from "drizzle-orm"
import { isAdminOrDirectorBySession, getSessionUserId } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"
import {
    type SeasonPhase,
    PHASE_CONFIG,
    isValidPhaseTransition,
    isValidPhaseRevert
} from "@/lib/season-phases"

export async function advanceSeasonPhase(
    seasonId: number,
    targetPhase: SeasonPhase
): Promise<{ status: boolean; message: string }> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) {
        return { status: false, message: "Unauthorized" }
    }

    if (!seasonId || seasonId <= 0) {
        return { status: false, message: "Invalid season ID" }
    }

    try {
        const [season] = await db
            .select({ id: seasons.id, phase: seasons.phase })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1)

        if (!season) {
            return { status: false, message: "Season not found" }
        }

        const currentPhase = season.phase as SeasonPhase
        if (!isValidPhaseTransition(currentPhase, targetPhase)) {
            return {
                status: false,
                message: `Cannot advance from "${PHASE_CONFIG[currentPhase].label}" to "${PHASE_CONFIG[targetPhase].label}"`
            }
        }

        await db
            .update(seasons)
            .set({ phase: targetPhase })
            .where(eq(seasons.id, seasonId))

        const userId = await getSessionUserId()
        await logAuditEntry({
            userId: userId!,
            action: "advance_season_phase",
            entityType: "season",
            entityId: seasonId,
            summary: `Advanced season phase from "${PHASE_CONFIG[currentPhase].label}" to "${PHASE_CONFIG[targetPhase].label}"`
        })

        return {
            status: true,
            message: `Season advanced to "${PHASE_CONFIG[targetPhase].label}"`
        }
    } catch (error) {
        console.error("Failed to advance season phase:", error)
        return { status: false, message: "Failed to advance season phase" }
    }
}

export async function revertSeasonPhase(
    seasonId: number,
    targetPhase: SeasonPhase
): Promise<{ status: boolean; message: string }> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) {
        return { status: false, message: "Unauthorized" }
    }

    if (!seasonId || seasonId <= 0) {
        return { status: false, message: "Invalid season ID" }
    }

    try {
        const [season] = await db
            .select({ id: seasons.id, phase: seasons.phase })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1)

        if (!season) {
            return { status: false, message: "Season not found" }
        }

        const currentPhase = season.phase as SeasonPhase
        if (!isValidPhaseRevert(currentPhase, targetPhase)) {
            return {
                status: false,
                message: `Cannot revert from "${PHASE_CONFIG[currentPhase].label}" to "${PHASE_CONFIG[targetPhase].label}"`
            }
        }

        await db
            .update(seasons)
            .set({ phase: targetPhase })
            .where(eq(seasons.id, seasonId))

        const userId = await getSessionUserId()
        await logAuditEntry({
            userId: userId!,
            action: "revert_season_phase",
            entityType: "season",
            entityId: seasonId,
            summary: `Reverted season phase from "${PHASE_CONFIG[currentPhase].label}" to "${PHASE_CONFIG[targetPhase].label}"`
        })

        return {
            status: true,
            message: `Season reverted to "${PHASE_CONFIG[targetPhase].label}"`
        }
    } catch (error) {
        console.error("Failed to revert season phase:", error)
        return { status: false, message: "Failed to revert season phase" }
    }
}

export async function getCurrentSeasonPhaseData(): Promise<{
    status: boolean
    message?: string
    data?: {
        seasonId: number
        seasonLabel: string
        phase: SeasonPhase
    }
}> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        const [season] = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                season: seasons.season,
                phase: seasons.phase
            })
            .from(seasons)
            .orderBy(desc(seasons.id))
            .limit(1)

        if (!season) {
            return { status: false, message: "No seasons found" }
        }

        return {
            status: true,
            data: {
                seasonId: season.id,
                seasonLabel: `${season.season.charAt(0).toUpperCase() + season.season.slice(1)} ${season.year}`,
                phase: season.phase as SeasonPhase
            }
        }
    } catch (error) {
        console.error("Failed to get season phase:", error)
        return { status: false, message: "Failed to load season data" }
    }
}
