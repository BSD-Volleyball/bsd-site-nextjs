import "server-only"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { db } from "@/database/db"
import {
    seasons,
    seasonEvents,
    eventTimeSlots,
    userUnavailability
} from "@/database/schema"
import { eq, asc, desc, inArray } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/next/session"
import type { EventType } from "./actions"

export interface SeasonConfigData {
    seasonId: number
    year: number
    seasonName: string
    code: string
    phase: string
    season_amount: string | null
    late_amount: string | null
    max_players: number | null
    certified_ref_rate: string | null
    uncertified_ref_rate: string | null
    events: {
        id: number
        event_type: EventType
        event_date: string
        sort_order: number
        label: string | null
        /** Players who have marked themselves unavailable for this date. */
        unavailable_player_count: number
        time_slots: {
            id: number
            start_time: string
            slot_label: string | null
            sort_order: number
        }[]
    }[]
}

export const getSeasonConfigData = withAction(
    async (): Promise<ActionResult<SeasonConfigData>> => {
        const isAdmin = await isAdminOrDirectorBySession()
        if (!isAdmin) {
            return fail("Unauthorized")
        }

        try {
            const [season] = await db
                .select()
                .from(seasons)
                .orderBy(desc(seasons.id))
                .limit(1)

            if (!season) {
                return fail("No seasons found")
            }

            const eventRows = await db
                .select()
                .from(seasonEvents)
                .where(eq(seasonEvents.season_id, season.id))
                .orderBy(
                    asc(seasonEvents.event_type),
                    asc(seasonEvents.sort_order)
                )

            const eventIds = eventRows.map((e) => e.id)
            let timeSlotRows: (typeof eventTimeSlots.$inferSelect)[] = []
            let unavailableCounts = new Map<number, number>()
            if (eventIds.length > 0) {
                const [slots, counts] = await Promise.all([
                    db
                        .select()
                        .from(eventTimeSlots)
                        .where(inArray(eventTimeSlots.event_id, eventIds))
                        .orderBy(asc(eventTimeSlots.sort_order)),
                    countUnavailablePlayersByEvent(eventIds)
                ])
                timeSlotRows = slots
                unavailableCounts = counts
            }

            const slotsByEvent = new Map<
                number,
                {
                    id: number
                    start_time: string
                    slot_label: string | null
                    sort_order: number
                }[]
            >()
            for (const ts of timeSlotRows) {
                const slots = slotsByEvent.get(ts.event_id) || []
                slots.push({
                    id: ts.id,
                    start_time: ts.start_time,
                    slot_label: ts.slot_label,
                    sort_order: ts.sort_order
                })
                slotsByEvent.set(ts.event_id, slots)
            }

            const events = eventRows.map((e) => ({
                id: e.id,
                event_type: e.event_type as EventType,
                event_date: e.event_date,
                sort_order: e.sort_order,
                label: e.label,
                unavailable_player_count: unavailableCounts.get(e.id) ?? 0,
                time_slots: slotsByEvent.get(e.id) || []
            }))

            return ok({
                seasonId: season.id,
                year: season.year,
                seasonName: season.season,
                code: season.code,
                phase: season.phase,
                season_amount: season.season_amount,
                late_amount: season.late_amount,
                max_players: season.max_players,
                certified_ref_rate: season.certified_ref_rate,
                uncertified_ref_rate: season.uncertified_ref_rate,
                events
            })
        } catch (error) {
            logger.error("Failed to load season config", undefined, error)
            return fail("Failed to load season configuration")
        }
    }
)

/**
 * How many distinct players have marked themselves unavailable for each of
 * `eventIds`. Events with nobody are absent from the map, not zero-valued.
 */
export async function countUnavailablePlayersByEvent(
    eventIds: number[]
): Promise<Map<number, number>> {
    if (eventIds.length === 0) return new Map()
    const rows = await db
        .select({
            eventId: userUnavailability.event_id,
            userId: userUnavailability.user_id
        })
        .from(userUnavailability)
        .where(inArray(userUnavailability.event_id, eventIds))

    const usersByEvent = new Map<number, Set<string>>()
    for (const row of rows) {
        const set = usersByEvent.get(row.eventId) ?? new Set<string>()
        set.add(row.userId)
        usersByEvent.set(row.eventId, set)
    }
    return new Map([...usersByEvent].map(([id, set]) => [id, set.size]))
}
