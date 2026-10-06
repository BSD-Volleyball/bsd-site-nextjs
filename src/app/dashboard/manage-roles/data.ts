import "server-only"

import { db } from "@/database/db"
import { seasons, divisions } from "@/database/schema"
import { desc, asc } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/next/session"

export interface SeasonOption {
    id: number
    label: string
}

export interface DivisionOption {
    id: number
    name: string
}

export async function getSeasonOptions(): Promise<SeasonOption[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    const rows = await db
        .select({
            id: seasons.id,
            code: seasons.code,
            year: seasons.year,
            season: seasons.season
        })
        .from(seasons)
        .orderBy(desc(seasons.id))

    return rows.map((s) => ({
        id: s.id,
        label: `${s.code} ${s.year} ${s.season}`
    }))
}

export async function getDivisionOptions(): Promise<DivisionOption[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    return db
        .select({ id: divisions.id, name: divisions.name })
        .from(divisions)
        .orderBy(asc(divisions.name))
}
