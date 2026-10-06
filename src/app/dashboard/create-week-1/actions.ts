"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import { withAction, ok, fail } from "@/next/action-helpers"
import { db } from "@/database/db"
import { signups, week1Rosters } from "@/database/schema"
import { and, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"

import { logAuditEntry } from "@/lib/audit-log"
import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"
import type { Week1RosterAssignment } from "./week1-types"

export const saveWeek1Rosters = withAction(
    async (assignments: Week1RosterAssignment[]): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to perform this action.")
        }

        if (assignments.length !== 104) {
            return fail(
                "Expected 104 assignments (96 primary + 8 alternates) before saving."
            )
        }

        const uniqueUsers = new Set(
            assignments.map((assignment) => assignment.userId)
        )
        if (uniqueUsers.size !== assignments.length) {
            return fail("Duplicate players found in roster assignments.")
        }

        const validAssignments = assignments.every((assignment) => {
            return (
                (assignment.sessionNumber === 1 ||
                    assignment.sessionNumber === 2 ||
                    assignment.sessionNumber === 3) &&
                assignment.courtNumber >= 1 &&
                assignment.courtNumber <= 4
            )
        })

        if (!validAssignments) {
            return fail(
                "Invalid session or court values in roster assignments."
            )
        }

        const primaryAssignments = assignments.filter(
            (assignment) =>
                assignment.sessionNumber === 1 || assignment.sessionNumber === 2
        )
        const alternateAssignments = assignments.filter(
            (assignment) => assignment.sessionNumber === 3
        )

        if (primaryAssignments.length !== 96) {
            return fail(
                "Expected exactly 96 primary assignments (sessions 1 and 2)."
            )
        }

        if (alternateAssignments.length !== 8) {
            return fail("Expected exactly 8 alternates (session 3).")
        }

        for (let court = 1; court <= 4; court++) {
            const courtAlternates = alternateAssignments.filter(
                (assignment) => assignment.courtNumber === court
            )
            if (courtAlternates.length !== 2) {
                return fail(`Expected 2 alternates for court ${court}.`)
            }
        }

        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return fail("No current season found.")
        }

        const signedUpRows = await db
            .select({ userId: signups.player })
            .from(signups)
            .where(
                and(
                    eq(signups.season, config.seasonId),
                    inArray(signups.player, [...uniqueUsers])
                )
            )

        if (signedUpRows.length !== assignments.length) {
            return fail(
                "All selected players must be signed up for the current season."
            )
        }

        try {
            await db.transaction(async (tx) => {
                await tx
                    .delete(week1Rosters)
                    .where(eq(week1Rosters.season, config.seasonId))

                await tx.insert(week1Rosters).values(
                    assignments.map((assignment) => ({
                        season: config.seasonId,
                        user: assignment.userId,
                        session_number: assignment.sessionNumber,
                        court_number: assignment.courtNumber
                    }))
                )
            })

            const actorId = await getSessionUserId()
            if (actorId) {
                await logAuditEntry({
                    userId: actorId,
                    action: "create",
                    entityType: "week1_rosters",
                    summary: `Created week 1 rosters for season ${config.seasonId}`
                })
            }

            revalidateCalendarFeeds()
            return ok(undefined, "Week 1 rosters saved successfully.")
        } catch (error) {
            logger.error("Error saving week 1 rosters", undefined, error)
            return fail("Something went wrong while saving week 1 rosters.")
        }
    }
)
