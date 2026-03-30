/**
 * Client-safe utility functions for working with season data
 * These functions don't import any server-side code
 */

import type { SeasonConfig, SeasonEvent, EventType } from "@/lib/season-types"

/** Get events filtered by type, sorted by sort_order */
export function getEventsByType(
    config: SeasonConfig,
    type: EventType
): SeasonEvent[] {
    return config.events
        .filter((e) => e.eventType === type)
        .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Format a date string (YYYY-MM-DD) to a human-readable label */
export function formatEventDate(dateStr: string): string {
    const d = new Date(`${dateStr}T12:00:00`)
    return d.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    })
}

/** Format a time string (HH:MM:SS) to a human-readable label */
export function formatEventTime(timeStr: string): string {
    const [hours, minutes] = timeStr.split(":")
    const hour12 = Number.parseInt(hours, 10)
    const ampm = hour12 >= 12 ? "PM" : "AM"
    const displayHour = hour12 % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
}