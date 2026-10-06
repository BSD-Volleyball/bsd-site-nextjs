import "server-only"

import { desc } from "drizzle-orm"
import { db } from "@/database/db"
import { waivers, users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { requireAdmin } from "@/next/action-helpers"

export interface WaiverRow {
    id: number
    content: string
    active: boolean
    created_at: Date
    created_by_name: string | null
}

export async function listWaivers(): Promise<WaiverRow[]> {
    await requireAdmin()
    const rows = await db
        .select({
            id: waivers.id,
            content: waivers.content,
            active: waivers.active,
            created_at: waivers.created_at,
            created_by_first: users.first_name,
            created_by_last: users.last_name
        })
        .from(waivers)
        .leftJoin(users, eq(waivers.created_by, users.id))
        .orderBy(desc(waivers.created_at))

    return rows.map((r) => ({
        id: r.id,
        content: r.content,
        active: r.active,
        created_at: r.created_at,
        created_by_name:
            r.created_by_first && r.created_by_last
                ? `${r.created_by_first} ${r.created_by_last}`
                : null
    }))
}
