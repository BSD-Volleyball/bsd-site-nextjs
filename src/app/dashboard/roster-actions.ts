"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail, requireSession } from "@/next/action-helpers"
import { db } from "@/database/db"
import { users, waitlist, teams, drafts } from "@/database/schema"
import { eq, and } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"
import { getActiveWaiver, recordWaiverAcceptance } from "@/lib/waivers"
import { getSessionUser, isAdminOrDirectorBySession } from "@/next/session"

export interface TeamRosterPlayer {
    id: string
    displayName: string
    lastName: string
    isCaptain: boolean
}

export interface TeamRosterData {
    teamName: string
    players: TeamRosterPlayer[]
}

export const getTeamRoster = withAction(
    async (teamId: number): Promise<ActionResult<TeamRosterData>> => {
        const sessionUser = await getSessionUser()
        if (!sessionUser) {
            return fail("Not authenticated.")
        }

        try {
            const [team] = await db
                .select({
                    id: teams.id,
                    name: teams.name,
                    captain: teams.captain,
                    captain2: teams.captain2,
                    season: teams.season
                })
                .from(teams)
                .where(eq(teams.id, teamId))
                .limit(1)

            if (!team) {
                return fail("Team not found.")
            }

            // Access rule: admins see everything; past-season rosters are
            // league-visible (they're shown in the Historical section anyway);
            // current-season rosters are limited to that team's own players.
            const isElevated = await isAdminOrDirectorBySession()
            if (!isElevated) {
                const config = await getSeasonConfig()
                if (config.seasonId === team.season) {
                    const isCaptain =
                        team.captain === sessionUser.id ||
                        team.captain2 === sessionUser.id
                    const [membership] = await db
                        .select({ id: drafts.id })
                        .from(drafts)
                        .where(
                            and(
                                eq(drafts.team, teamId),
                                eq(drafts.user, sessionUser.id)
                            )
                        )
                        .limit(1)
                    if (!isCaptain && !membership) {
                        return fail(
                            "Current-season rosters are only visible to that team's players."
                        )
                    }
                }
            }

            const draftRows = await db
                .select({
                    userId: drafts.user,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name
                })
                .from(drafts)
                .innerJoin(users, eq(drafts.user, users.id))
                .where(eq(drafts.team, teamId))

            const players: TeamRosterPlayer[] = draftRows.map((row) => ({
                id: row.userId,
                displayName: row.preferredName || row.firstName,
                lastName: row.lastName,
                isCaptain: row.userId === team.captain
            }))

            players.sort((a, b) => {
                const lastCmp = a.lastName
                    .toLowerCase()
                    .localeCompare(b.lastName.toLowerCase())
                if (lastCmp !== 0) return lastCmp
                return a.displayName
                    .toLowerCase()
                    .localeCompare(b.displayName.toLowerCase())
            })

            return ok({
                teamName: team.name,
                players
            })
        } catch (error) {
            logger.error("Error fetching team roster", undefined, error)
            return fail("Something went wrong.")
        }
    }
)

export async function logContactDetailsViewed(): Promise<void> {
    const sessionUser = await getSessionUser()
    if (!sessionUser) return

    const config = await getSeasonConfig()
    if (!config.seasonId) return

    const [teamRow] = await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(
            and(
                eq(teams.season, config.seasonId),
                eq(teams.captain, sessionUser.id)
            )
        )
        .limit(1)

    await logAuditEntry({
        userId: sessionUser.id,
        action: "view",
        entityType: "teams",
        entityId: teamRow?.id,
        summary: `Captain viewed team contact details for team "${teamRow?.name ?? "unknown"}" (season ${config.seasonId})`
    })
}

export const expressWaitlistInterest = withAction(
    async (
        seasonId: number,
        waiverId: number,
        waiverAgreed: boolean
    ): Promise<ActionResult> => {
        const session = await requireSession()

        if (!waiverAgreed) {
            return fail("You must agree to the waiver to join the waitlist.")
        }

        const activeWaiver = await getActiveWaiver()
        if (!activeWaiver || activeWaiver.id !== waiverId) {
            return fail(
                "The waiver was updated while you were submitting. Please reload and re-confirm the current waiver."
            )
        }

        try {
            // Check if user is already on the waitlist for this season
            const [existing] = await db
                .select({ id: waitlist.id })
                .from(waitlist)
                .where(
                    and(
                        eq(waitlist.season, seasonId),
                        eq(waitlist.user, session.user.id)
                    )
                )
                .limit(1)

            if (existing) {
                return fail(
                    "You've already expressed interest for this season."
                )
            }

            await recordWaiverAcceptance(session.user.id, activeWaiver.id)

            await db.insert(waitlist).values({
                season: seasonId,
                user: session.user.id,
                created_at: new Date()
            })

            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "waitlist",
                summary: `Expressed waitlist interest for season ${seasonId}`
            })

            return ok(
                undefined,
                "Your interest has been recorded. We'll reach out if a spot opens up!"
            )
        } catch (error) {
            logger.error(
                "Failed to express waitlist interest",
                undefined,
                error
            )
            return fail("Something went wrong. Please try again.")
        }
    }
)
