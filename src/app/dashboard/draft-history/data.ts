import "server-only"

import { db } from "@/database/db"
import { seasons } from "@/database/schema"
import { desc } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/next/session"

export async function getAvailableYears(): Promise<number[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) return []

    const rows = await db
        .selectDistinct({ year: seasons.year })
        .from(seasons)
        .orderBy(desc(seasons.year))

    return rows.map((r) => r.year)
}
