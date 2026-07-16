import "server-only"

import { cache } from "react"
import { db } from "@/database/db"
import {
    seasons,
    seasonEvents,
    eventTimeSlots,
    signups,
    waitlist
} from "@/database/schema"
import { eq, desc, count, and, asc } from "drizzle-orm"
import { SEASON_PHASES, type SeasonPhase } from "@/lib/season-phases"
import type { EventType, SeasonEvent, SeasonConfig } from "@/lib/season-types"
import { getEventsByType } from "@/lib/season-utils"

// Re-export types from season-types.ts (client-safe)
export type {
    EventType,
    TimeSlot,
    SeasonEvent,
    SeasonConfig,
    PlayerUnavailability
} from "@/lib/season-types"

// Re-export utility functions from season-utils.ts (client-safe)
export {
    getEventsByType,
    formatSeasonLabel,
    formatEventDate,
    formatShortDate,
    formatEventTime,
    formatMatchTime
} from "@/lib/season-utils"

const EMPTY_CONFIG: SeasonConfig = {
    seasonId: 0,
    seasonAmount: "",
    lateAmount: "",
    maxPlayers: 0,
    seasonYear: 0,
    seasonName: "",
    phase: "off_season",
    events: []
}

// cache() memoizes per request, so the many callers across a single render
// (pages, rbac helpers, actions) share one lookup instead of re-querying.
export const getSeasonConfig = cache(async (): Promise<SeasonConfig> => {
    const [season] = await db
        .select()
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(1)

    if (!season) {
        return EMPTY_CONFIG
    }

    const eventRows = await db
        .select({ event: seasonEvents, slot: eventTimeSlots })
        .from(seasonEvents)
        .leftJoin(eventTimeSlots, eq(eventTimeSlots.event_id, seasonEvents.id))
        .where(eq(seasonEvents.season_id, season.id))
        .orderBy(
            asc(seasonEvents.event_type),
            asc(seasonEvents.sort_order),
            asc(eventTimeSlots.sort_order)
        )

    const eventsById = new Map<number, SeasonEvent>()
    for (const row of eventRows) {
        let event = eventsById.get(row.event.id)
        if (!event) {
            event = {
                id: row.event.id,
                eventType: row.event.event_type as EventType,
                eventDate: row.event.event_date,
                sortOrder: row.event.sort_order,
                label: row.event.label,
                timeSlots: []
            }
            eventsById.set(row.event.id, event)
        }
        if (row.slot) {
            event.timeSlots.push({
                id: row.slot.id,
                startTime: row.slot.start_time,
                slotLabel: row.slot.slot_label,
                sortOrder: row.slot.sort_order
            })
        }
    }

    return {
        seasonId: season.id,
        seasonAmount: season.season_amount || "",
        lateAmount: season.late_amount || "",
        maxPlayers: season.max_players || 0,
        seasonYear: season.year,
        seasonName: season.season,
        phase: SEASON_PHASES.includes(season.phase as SeasonPhase)
            ? (season.phase as SeasonPhase)
            : "off_season",
        events: [...eventsById.values()]
    }
})

function isPastLateDateET(lateDate: string): boolean {
    const nowET = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
    )
    const target = new Date(`${lateDate}T23:59:59`)
    return nowET >= target
}

export function getCurrentSeasonAmount(config: SeasonConfig): string {
    const lateDateEvent = getEventsByType(config, "late_date")[0]
    if (lateDateEvent && config.lateAmount) {
        if (isPastLateDateET(lateDateEvent.eventDate)) {
            return config.lateAmount
        }
    }
    return config.seasonAmount
}

export function isLatePricing(config: SeasonConfig): boolean {
    const lateDateEvent = getEventsByType(config, "late_date")[0]
    if (lateDateEvent && config.lateAmount) {
        return isPastLateDateET(lateDateEvent.eventDate)
    }
    return false
}

export async function checkSignupEligibility(userId: string): Promise<boolean> {
    const config = await getSeasonConfig()

    if (config.phase !== "registration_open" || !config.seasonId) {
        return false
    }

    const [existingSignup] = await db
        .select({ id: signups.id })
        .from(signups)
        .where(
            and(eq(signups.season, config.seasonId), eq(signups.player, userId))
        )
        .limit(1)

    if (existingSignup) {
        return false
    }

    const maxPlayers = config.maxPlayers
    if (maxPlayers > 0) {
        const [result] = await db
            .select({ total: count() })
            .from(signups)
            .where(eq(signups.season, config.seasonId))

        if (result && result.total >= maxPlayers) {
            const [waitlistEntry] = await db
                .select({ approved: waitlist.approved })
                .from(waitlist)
                .where(
                    and(
                        eq(waitlist.season, config.seasonId),
                        eq(waitlist.user, userId)
                    )
                )
                .limit(1)

            return waitlistEntry?.approved ?? false
        }
    }

    return true
}
