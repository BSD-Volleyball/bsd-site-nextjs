// Shared save path for the week-2/3 roster builders. Callers (the route
// actions) are responsible for authorization; this module validates the
// payload and writes it. Server-only: never import from client components.

import "server-only"

import { headers } from "next/headers"
import { and, eq, inArray } from "drizzle-orm"
import type { ActionResult } from "@/lib/action-helpers"
import { ok, fail } from "@/lib/action-helpers"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import {
    signups,
    divisions,
    teams,
    individual_divisions,
    week2Rosters,
    week3Rosters
} from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"
import type { SavedAssignment } from "./types"

export async function savePreseasonWeekRosters(
    week: 2 | 3,
    assignments: SavedAssignment[]
): Promise<ActionResult> {
    if (assignments.length === 0) {
        return fail("No roster assignments provided.")
    }

    const uniqueUsers = new Set(
        assignments.map((assignment) => assignment.userId)
    )

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return fail("No current season found.")
    }

    const [validSignups, activeDivisions, captainRows, indivDivRows] =
        await Promise.all([
            db
                .select({ userId: signups.player })
                .from(signups)
                .where(
                    and(
                        eq(signups.season, config.seasonId),
                        inArray(signups.player, [...uniqueUsers])
                    )
                ),
            db
                .select({ id: divisions.id })
                .from(divisions)
                .where(eq(divisions.active, true)),
            db
                .select({
                    userId: teams.captain,
                    divisionId: teams.division
                })
                .from(teams)
                .where(eq(teams.season, config.seasonId)),
            db
                .select({
                    divisionId: individual_divisions.division,
                    coaches: individual_divisions.coaches
                })
                .from(individual_divisions)
                .where(eq(individual_divisions.season, config.seasonId))
        ])

    if (validSignups.length !== uniqueUsers.size) {
        return fail(
            "All selected players must be signed up for the current season."
        )
    }

    const activeDivisionIds = new Set(
        activeDivisions.map((division) => division.id)
    )

    const hasInvalidDivision = assignments.some(
        (assignment) => !activeDivisionIds.has(assignment.divisionId)
    )

    if (hasInvalidDivision) {
        return fail("One or more assignments are using an invalid division.")
    }

    const coachesDivisionIds = new Set(
        indivDivRows.filter((row) => row.coaches).map((row) => row.divisionId)
    )

    // A user captaining both a coaches and a regular division resolves to
    // the regular one; pure coaches-division captains are exempt below.
    const captainDivisionByUser = new Map<string, number>()
    for (const row of captainRows) {
        const existing = captainDivisionByUser.get(row.userId)
        if (existing && !coachesDivisionIds.has(existing)) {
            continue
        }
        captainDivisionByUser.set(row.userId, row.divisionId)
    }

    for (const assignment of assignments) {
        const captainDivisionId = captainDivisionByUser.get(assignment.userId)
        if (!captainDivisionId) {
            continue
        }
        // Coaches are treated as regular players — no division or flag constraint
        if (coachesDivisionIds.has(captainDivisionId)) {
            continue
        }
        if (
            assignment.divisionId !== captainDivisionId ||
            !assignment.isCaptain
        ) {
            return fail(
                "Captains must remain in their captained division and be flagged as captains."
            )
        }
    }

    // week2Rosters and week3Rosters share an identical column set; the cast
    // gives us one code path (same trick as src/lib/pdf/*).
    const rosterTable = (
        week === 2 ? week2Rosters : week3Rosters
    ) as typeof week2Rosters

    try {
        await db.transaction(async (tx) => {
            await tx
                .delete(rosterTable)
                .where(eq(rosterTable.season, config.seasonId))

            await tx.insert(rosterTable).values(
                assignments.map((assignment) => ({
                    season: config.seasonId,
                    user: assignment.userId,
                    division: assignment.divisionId,
                    team_number: assignment.teamNumber,
                    is_captain: assignment.isCaptain
                }))
            )
        })

        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: `week${week}_rosters`,
                summary: `Created week ${week} rosters for season ${config.seasonId}`
            })
        }

        return ok(undefined, `Week ${week} rosters saved successfully.`)
    } catch (error) {
        console.error(`Error saving week ${week} rosters:`, error)
        return fail(`Something went wrong while saving week ${week} rosters.`)
    }
}
