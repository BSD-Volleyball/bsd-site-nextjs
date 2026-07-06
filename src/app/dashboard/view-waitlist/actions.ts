"use server"

import { db } from "@/database/db"
import {
    users,
    seasons,
    waitlist,
    drafts,
    teams,
    divisions
} from "@/database/schema"
import { eq, desc, inArray, and } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requireAdmin,
    requireSeasonConfig,
    requirePositiveInt
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"

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

export const setWaitlistApproval = withAction(
    async (waitlistId: number, approved: boolean): Promise<ActionResult> => {
        await requireAdmin()
        const session = await requireSession()
        const config = await requireSeasonConfig()
        requirePositiveInt(waitlistId, "waitlist entry")

        const [entry] = await db
            .select({
                id: waitlist.id,
                userId: waitlist.user
            })
            .from(waitlist)
            .where(
                and(
                    eq(waitlist.id, waitlistId),
                    eq(waitlist.season, config.seasonId)
                )
            )
            .limit(1)

        if (!entry) {
            return fail("Waitlist entry not found.")
        }

        await db
            .update(waitlist)
            .set({ approved })
            .where(eq(waitlist.id, waitlistId))

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "waitlist",
            entityId: waitlistId.toString(),
            summary: `${approved ? "Approved" : "Unapproved"} waitlist entry for user ${entry.userId}`
        })

        return ok(
            undefined,
            approved
                ? "Player approved from waitlist."
                : "Player unapproved on waitlist."
        )
    }
)
