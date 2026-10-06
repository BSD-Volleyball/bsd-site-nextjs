import "server-only"

import { db } from "@/database/db"
import {
    users,
    seasons,
    waitlist,
    drafts,
    teams,
    divisions
} from "@/database/schema"
import { eq, desc, inArray } from "drizzle-orm"
import {
    withAction,
    ok,
    requireAdmin,
    requireSeasonConfig
} from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"

export interface WaitlistEntry {
    waitlistId: number
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    email: string
    male: boolean | null
    approved: boolean
    createdAt: Date
    lastDivision: string | null
}

export const getSeasonWaitlist = withAction(
    async (): Promise<
        ActionResult<{ entries: WaitlistEntry[]; seasonLabel: string }>
    > => {
        await requireAdmin()
        const config = await requireSeasonConfig()

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        const rows = await db
            .select({
                waitlistId: waitlist.id,
                userId: waitlist.user,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                email: users.email,
                male: users.male,
                approved: waitlist.approved,
                createdAt: waitlist.created_at
            })
            .from(waitlist)
            .innerJoin(users, eq(waitlist.user, users.id))
            .where(eq(waitlist.season, config.seasonId))
            .orderBy(waitlist.created_at)

        // Look up most recent division for each user from drafts
        const userIds = rows.map((r) => r.userId)
        const lastDivisionMap = new Map<string, string>()

        if (userIds.length > 0) {
            const draftRows = await db
                .select({
                    user: drafts.user,
                    divisionName: divisions.name,
                    seasonId: seasons.id
                })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .innerJoin(seasons, eq(teams.season, seasons.id))
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .where(inArray(drafts.user, userIds))
                .orderBy(desc(seasons.year), desc(seasons.id))

            // Keep only the first (most recent) per user
            for (const row of draftRows) {
                if (!lastDivisionMap.has(row.user)) {
                    lastDivisionMap.set(row.user, row.divisionName)
                }
            }
        }

        const entries: WaitlistEntry[] = rows.map((row) => ({
            ...row,
            lastDivision: lastDivisionMap.get(row.userId) ?? null
        }))

        return ok({ entries, seasonLabel })
    }
)
