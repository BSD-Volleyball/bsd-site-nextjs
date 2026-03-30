/**
 * Season and event types - client-safe, no database imports
 */

import type { SeasonPhase } from "@/lib/season-phases"

export type EventType =
    | "tryout"
    | "regular_season"
    | "playoff"
    | "draft"
    | "captain_select"
    | "late_date"

export interface TimeSlot {
    id: number
    startTime: string
    slotLabel: string | null
    sortOrder: number
}

export interface SeasonEvent {
    id: number
    eventType: EventType
    eventDate: string
    sortOrder: number
    label: string | null
    timeSlots: TimeSlot[]
}

export interface SeasonConfig {
    seasonId: number
    seasonAmount: string
    lateAmount: string
    maxPlayers: number
    seasonYear: number
    seasonName: string
    phase: SeasonPhase
    events: SeasonEvent[]
}

export interface PlayerUnavailability {
    signupId: number
    eventId: number
    eventDate: string
    eventType: EventType
    label?: string | null
}