import "server-only"

import { formatSeasonRowLabel } from "@/lib/season-utils"
import { desc } from "drizzle-orm"
import { db } from "@/database/db"
import { seasons } from "@/database/schema"
import { isAdminOrDirectorBySession } from "@/next/session"

export interface PictureSeasonOption {
    seasonId: number
    label: string
}

/** Season list for the admin-only selector; empty for non-admins. */
export async function getSeasonOptionsForPictures(): Promise<
    PictureSeasonOption[]
> {
    if (!(await isAdminOrDirectorBySession())) return []

    const rows = await db
        .select({
            id: seasons.id,
            year: seasons.year,
            season: seasons.season
        })
        .from(seasons)
        .orderBy(desc(seasons.id))

    return rows.map((row) => ({
        seasonId: row.id,
        label: formatSeasonRowLabel(row)
    }))
}
