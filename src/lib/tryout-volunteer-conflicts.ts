/**
 * Detects when a tryout volunteer is also scheduled to PLAY at the same
 * time they've been assigned to work.
 *
 * The three tryout nights store playing assignments differently:
 *   - Week 1 (`week1_rosters`) has an explicit `session_number`. Values 1
 *     and 2 are playing sessions; 3 means "alternate" and is deliberately
 *     NOT treated as a conflict.
 *   - Weeks 2/3 (`week2_rosters`/`week3_rosters`) have no session column —
 *     the session is derived from `team_number` via
 *     `getSessionNumberFromTeam()`.
 *
 * Both are normalised here into the same currency the volunteer pages
 * speak: `event_time_slots.id`.
 */

import { eq } from "drizzle-orm"

import { db } from "@/database/db"
import { week1Rosters, week2Rosters, week3Rosters } from "@/database/schema"
import { getSessionNumberFromTeam } from "@/lib/courts"
import { getEventsByType } from "@/lib/season-utils"
import type { SeasonConfig, SeasonEvent } from "@/lib/season-types"

/** userId → set of time slot ids that user is rostered to play in. */
export type PlayingSlotsByUser = Map<string, Set<number>>

interface RosterRow {
    user: string
    /** 1-based session number for the night. */
    sessionNumber: number
}

/**
 * Pure mapping half, split out so the week-2/3 team arithmetic and the
 * week-1 alternate exclusion can be unit tested without a database.
 */
export function mapRostersToSlots(
    tryoutEvents: SeasonEvent[],
    rostersByEventIndex: [RosterRow[], RosterRow[], RosterRow[]]
): PlayingSlotsByUser {
    const result: PlayingSlotsByUser = new Map()

    rostersByEventIndex.forEach((rows, eventIndex) => {
        const event = tryoutEvents[eventIndex]
        if (!event) return

        const slots = [...event.timeSlots].sort(
            (a, b) => a.sortOrder - b.sortOrder
        )

        for (const row of rows) {
            const slot = slots[row.sessionNumber - 1]
            if (!slot) continue

            const existing = result.get(row.user)
            if (existing) {
                existing.add(slot.id)
            } else {
                result.set(row.user, new Set([slot.id]))
            }
        }
    })

    return result
}

/**
 * Load every "this user is playing in this time slot" pair for the
 * season's tryout nights. Callers build this once per page render and do
 * lookups against it while rendering assignments.
 */
export async function getPlayingSlotsBySeason(
    config: SeasonConfig
): Promise<PlayingSlotsByUser> {
    const tryoutEvents = getEventsByType(config, "tryout")
    if (tryoutEvents.length === 0) return new Map()

    const [week1, week2, week3] = await Promise.all([
        db
            .select({
                user: week1Rosters.user,
                sessionNumber: week1Rosters.session_number
            })
            .from(week1Rosters)
            .where(eq(week1Rosters.season, config.seasonId)),
        db
            .select({
                user: week2Rosters.user,
                teamNumber: week2Rosters.team_number
            })
            .from(week2Rosters)
            .where(eq(week2Rosters.season, config.seasonId)),
        db
            .select({
                user: week3Rosters.user,
                teamNumber: week3Rosters.team_number
            })
            .from(week3Rosters)
            .where(eq(week3Rosters.season, config.seasonId))
    ])

    return mapRostersToSlots(tryoutEvents, [
        // session_number 3 = alternate, not scheduled to play.
        week1.filter((r) => r.sessionNumber === 1 || r.sessionNumber === 2),
        week2.map((r) => ({
            user: r.user,
            sessionNumber: getSessionNumberFromTeam(r.teamNumber)
        })),
        week3.map((r) => ({
            user: r.user,
            sessionNumber: getSessionNumberFromTeam(r.teamNumber)
        }))
    ])
}
