"use server"

import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { and, eq, or } from "drizzle-orm"
import { getSessionUser } from "@/next/session"
import { db } from "@/database/db"
import { draftHomework, teams } from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"

export interface SaveDraftHomeworkInput {
    selections: {
        round: number
        slot: number
        playerId: string
        isMaleTab: boolean
    }[]
}

export const saveDraftHomework = withAction(
    async (input: SaveDraftHomeworkInput): Promise<ActionResult> => {
        const user = await getSessionUser()

        if (!user) {
            return fail("Not authenticated")
        }

        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return fail("No active season found")
        }

        const [captainTeam] = await db
            .select({ divisionId: teams.division })
            .from(teams)
            .where(
                and(
                    eq(teams.season, config.seasonId),
                    or(eq(teams.captain, user.id), eq(teams.captain2, user.id))
                )
            )
            .limit(1)

        if (!captainTeam) {
            return fail("You are not a captain this season")
        }

        await db
            .delete(draftHomework)
            .where(
                and(
                    eq(draftHomework.season, config.seasonId),
                    eq(draftHomework.captain, user.id)
                )
            )

        const nonEmpty = input.selections.filter((s) => s.playerId)

        if (nonEmpty.length > 0) {
            const now = new Date()
            await db.insert(draftHomework).values(
                nonEmpty.map((s) => ({
                    season: config.seasonId as number,
                    captain: user.id,
                    division: captainTeam.divisionId,
                    round: s.round,
                    slot: s.slot,
                    player: s.playerId,
                    is_male_tab: s.isMaleTab,
                    updated_at: now
                }))
            )
        }

        await logAuditEntry({
            userId: user.id,
            action: "save_draft_homework",
            entityType: "draft_homework",
            entityId: config.seasonId,
            summary: `Saved draft homework with ${nonEmpty.length} selections (season ${config.seasonId})`
        })

        return ok(undefined, "Draft homework saved successfully!")
    }
)

// --- Last season's draft data ---

export interface LastSeasonDraftPick {
    round: number
    playerFirstName: string
    playerLastName: string
    playerPreferredName: string | null
    playerMale: boolean | null
}

export interface LastSeasonDraftTeam {
    teamId: number
    teamName: string
    teamNumber: number | null
    captainFirstName: string
    captainLastName: string
    captainPreferredName: string | null
    picks: LastSeasonDraftPick[]
}

export interface LastSeasonDraftData {
    seasonName: string
    seasonYear: number
    divisionName: string
    teams: LastSeasonDraftTeam[]
    numRounds: number
}
