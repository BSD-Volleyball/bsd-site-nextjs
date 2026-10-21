"use server"

import { db } from "@/database/db"
import { seasons } from "@/database/schema"
import { eq, asc } from "drizzle-orm"
import {
    getDraftResultsForDivision,
    getSeasonDivisions,
    type DivisionOption,
    type DraftTeam
} from "@/lib/draft-results"
import { isAdminOrDirectorBySession } from "@/next/session"
import {
    withAction,
    ok,
    requireAdmin,
    requirePositiveInt
} from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"

export type SeasonOption = { id: number; code: string; season: string }

export async function getSeasonsForYear(year: number): Promise<SeasonOption[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    if (!Number.isInteger(year) || year < 2000 || year > 2100) return []

    return db
        .select({
            id: seasons.id,
            code: seasons.code,
            season: seasons.season
        })
        .from(seasons)
        .where(eq(seasons.year, year))
        .orderBy(asc(seasons.id))
}

export async function getDivisionsForSeason(
    seasonId: number
): Promise<DivisionOption[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    if (!Number.isInteger(seasonId) || seasonId <= 0) return []

    return getSeasonDivisions(seasonId)
}

export const getDraftResults = withAction(
    async (
        seasonId: number,
        divisionId: number
    ): Promise<ActionResult<DraftTeam[]>> => {
        await requireAdmin()
        requirePositiveInt(seasonId, "season")
        requirePositiveInt(divisionId, "division")

        return ok(await getDraftResultsForDivision(seasonId, divisionId))
    }
)
