import "server-only"

import { db } from "@/database/db"
import { seasons, tournaments } from "@/database/schema"
import { isAdminOrDirectorBySession } from "@/next/session"

/**
 * Distinct calendar years that have any season or tournament data, newest
 * first. The current year is always included so the report defaults to a real
 * option even before the season/tournament rows for it exist.
 */
export async function getInsuranceReportYears(): Promise<number[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    const [seasonYears, tournamentYears] = await Promise.all([
        db.selectDistinct({ year: seasons.year }).from(seasons),
        db.selectDistinct({ year: tournaments.year }).from(tournaments)
    ])

    const set = new Set<number>()
    for (const row of seasonYears) set.add(row.year)
    for (const row of tournamentYears) set.add(row.year)
    set.add(new Date().getFullYear())

    return Array.from(set).sort((a, b) => b - a)
}
