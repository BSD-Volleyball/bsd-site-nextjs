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

/** Format a match time (HH:MM:SS or H:MM) to compact display without leading zeros or seconds (e.g., "7:00") */
export function formatMatchTime(timeStr: string | null | undefined): string {
    if (!timeStr) return ""
    const parts = timeStr.split(":")
    const hour = Number.parseInt(parts[0], 10)
    const minutes = parts[1] ?? "00"
    return `${hour}:${minutes}`
}