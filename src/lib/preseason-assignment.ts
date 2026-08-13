/**
 * preseason-assignment.ts — a player's tryout-week slot for the current phase.
 *
 * During the prep_tryout_week_* phases nobody is drafted yet, so there are no
 * matches to report: "where do they play next" is a week 1/2/3 roster slot.
 * Batched by user id because the friends list asks for several at once.
 * No authorization checks — callers must gate access.
 */

import { db } from "@/database/db"
import {
    divisions,
    week1Rosters,
    week2Rosters,
    week3Rosters
} from "@/database/schema"
import { and, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { getEventsByType, formatEventTime } from "@/lib/season-utils"
import type { SeasonPhase } from "@/lib/season-phases"
import {
    LEGACY_COURT_BY_DIVISION,
    getSessionNumberFromTeam
} from "@/lib/courts"

export interface PreseasonAssignment {
    week: number
    /** Session 3 in week 1 is the alternate list, not a playing session. */
    sessionLabel: string
    courtNumber: number | null
    divisionName: string | null
    date: string | null
    time: string | null
}

const PHASE_WEEK: Partial<Record<SeasonPhase, 1 | 2 | 3>> = {
    prep_tryout_week_1: 1,
    prep_tryout_week_2: 2,
    prep_tryout_week_3: 3
}

/**
 * Tryout slots for the given users in the season's current preseason week.
 * Returns an empty map outside the prep_tryout_week_* phases.
 */
export async function getPreseasonAssignmentsForUsers(
    userIds: string[],
    seasonId: number
): Promise<Map<string, PreseasonAssignment>> {
    const result = new Map<string, PreseasonAssignment>()
    if (userIds.length === 0) return result

    const config = await getSeasonConfig()
    const week = PHASE_WEEK[config.phase]
    if (!week || config.seasonId !== seasonId) return result

    const tryoutEvent = getEventsByType(config, "tryout")[week - 1]
    const date = tryoutEvent?.eventDate ?? null
    const slots = tryoutEvent?.timeSlots ?? []

    function sessionTime(sessionNumber: number): string | null {
        const slot = slots[Math.min(sessionNumber, 2) - 1]
        return slot ? formatEventTime(slot.startTime) || null : null
    }

    if (week === 1) {
        const rows = await db
            .select({
                user: week1Rosters.user,
                sessionNumber: week1Rosters.session_number,
                courtNumber: week1Rosters.court_number
            })
            .from(week1Rosters)
            .where(
                and(
                    eq(week1Rosters.season, seasonId),
                    inArray(week1Rosters.user, userIds)
                )
            )

        for (const row of rows) {
            const isAlternate = row.sessionNumber === 3
            result.set(row.user, {
                week,
                sessionLabel: isAlternate
                    ? "Alternate"
                    : `Session ${row.sessionNumber}`,
                courtNumber: isAlternate ? null : row.courtNumber,
                divisionName: null,
                date,
                time: isAlternate ? null : sessionTime(row.sessionNumber)
            })
        }
        return result
    }

    const table = week === 2 ? week2Rosters : week3Rosters
    const rows = await db
        .select({
            user: table.user,
            teamNumber: table.team_number,
            divisionName: divisions.name
        })
        .from(table)
        .innerJoin(divisions, eq(table.division, divisions.id))
        .where(and(eq(table.season, seasonId), inArray(table.user, userIds)))

    for (const row of rows) {
        const sessionNumber = getSessionNumberFromTeam(row.teamNumber)
        result.set(row.user, {
            week,
            sessionLabel: `Session ${sessionNumber}`,
            courtNumber: LEGACY_COURT_BY_DIVISION[row.divisionName] ?? null,
            divisionName: row.divisionName,
            date,
            time: sessionTime(sessionNumber)
        })
    }
    return result
}
