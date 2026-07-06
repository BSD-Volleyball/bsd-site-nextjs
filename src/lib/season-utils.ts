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

/** Format a date string (YYYY-MM-DD) to a short label, e.g. "Thu, Apr 2" */
export function formatShortDate(dateStr: string): string {
    const d = new Date(`${dateStr}T12:00:00`)
    return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
    })
}

/** Format a time string (HH:MM:SS) to a human-readable label with AM/PM */
export function formatEventTime(timeStr: string): string {
    const [hours, minutes] = timeStr.split(":")
    const hour12 = Number.parseInt(hours, 10)
    const ampm = hour12 >= 12 ? "PM" : "AM"
    const displayHour = hour12 % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
}

/** Format a match time (HH:MM:SS or H:MM) to human-readable 12-hour format (e.g., "7:00 PM") */
export function formatMatchTime(timeStr: string | null | undefined): string {
    if (!timeStr) return ""
    const parts = timeStr.split(":")
    const hour24 = Number.parseInt(parts[0], 10)
    const minutes = parts[1] ?? "00"
    const ampm = hour24 >= 12 ? "PM" : "AM"
    const hour12 = hour24 % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
}

/**
 * Convert a time string (HH:MM or HH:MM:SS) to minutes-since-midnight for
 * sorting; unparseable/missing times sort last.
 */
export function parseTimeForSort(time: string | null): number {
    if (!time) return Number.MAX_SAFE_INTEGER
    const match = time.match(/^(\d{1,2}):(\d{2})/)
    if (!match) return Number.MAX_SAFE_INTEGER
    const hour = Number.parseInt(match[1], 10)
    const minute = Number.parseInt(match[2], 10)
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
        return Number.MAX_SAFE_INTEGER
    }
    return hour * 60 + minute
}
