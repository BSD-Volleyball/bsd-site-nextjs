import "server-only"

import { db } from "@/database/db"
import {
    seasons,
    seasonEvents,
    eventTimeSlots,
    signups,
    waitlist
} from "@/database/schema"
import { eq, desc, count, and, asc, inArray } from "drizzle-orm"
import { SEASON_PHASES, type SeasonPhase } from "@/lib/season-phases"
import type {
    EventType,
    TimeSlot,
    SeasonEvent,
    SeasonConfig
} from "@/lib/season-types"
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

export async function getSeasonConfig(): Promise<SeasonConfig> {
    const [season] = await db
        .select()
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(1)

    if (!season) {
        return EMPTY_CONFIG
    }

    const eventRows = await db
        .select()
        .from(seasonEvents)
        .where(eq(seasonEvents.season_id, season.id))
        .orderBy(asc(seasonEvents.event_type), asc(seasonEvents.sort_order))

    const eventIds = eventRows.map((e) => e.id)

    let timeSlotRows: (typeof eventTimeSlots.$inferSelect)[] = []
    if (eventIds.length > 0) {
        timeSlotRows = await db
            .select()
            .from(eventTimeSlots)
            .where(inArray(eventTimeSlots.event_id, eventIds))
            .orderBy(asc(eventTimeSlots.sort_order))
    }

    const slotsByEvent = new Map<number, TimeSlot[]>()
    for (const ts of timeSlotRows) {
        const slots = slotsByEvent.get(ts.event_id) || []
        slots.push({
            id: ts.id,
            startTime: ts.start_time,
            slotLabel: ts.slot_label,
            sortOrder: ts.sort_order
        })
        slotsByEvent.set(ts.event_id, slots)
    }

    const events: SeasonEvent[] = eventRows.map((e) => ({
        id: e.id,
        eventType: e.event_type as EventType,
        eventDate: e.event_date,
        sortOrder: e.sort_order,
        label: e.label,
        timeSlots: slotsByEvent.get(e.id) || []
    }))

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
        events
    }
}

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
