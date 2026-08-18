"use client"

import { RiCheckboxCircleLine, RiCloseCircleFill } from "@remixicon/react"
import { Week1TryoutCallout } from "@/components/week1-tryout-callout"
import type { SeasonConfig, SeasonEvent } from "@/lib/season-types"
import { formatEventDate, getEventsByType } from "@/lib/season-utils"
import { cn } from "@/lib/utils"

function EventToggleRow({
    event,
    unavailable,
    scheduledTime,
    onToggle,
    unavailableTone = "red"
}: {
    event: SeasonEvent
    unavailable: boolean
    scheduledTime: string | undefined
    onToggle: () => void
    /**
     * "amber" softens the unavailable styling for dates that are optional
     * for this player (a returning player sitting out week 1 evaluations).
     */
    unavailableTone?: "red" | "amber"
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
        >
            {unavailable ? (
                <RiCloseCircleFill
                    className={cn(
                        "h-4 w-4 shrink-0",
                        unavailableTone === "amber"
                            ? "text-amber-500"
                            : "text-red-500"
                    )}
                />
            ) : (
                <RiCheckboxCircleLine className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span
                className={cn(
                    unavailable &&
                        (unavailableTone === "amber"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-red-600 dark:text-red-400")
                )}
            >
                {formatEventDate(event.eventDate)}
                {scheduledTime && (
                    <span className="ml-1.5 text-muted-foreground text-sm">
                        {scheduledTime}
                    </span>
                )}
            </span>
        </button>
    )
}

function EventColumn({
    title,
    events,
    selectedEvents,
    scheduledTimesByEventId,
    onToggle
}: {
    title: string
    events: SeasonEvent[]
    selectedEvents: Set<number>
    scheduledTimesByEventId: Record<number, string>
    onToggle: (eventId: number) => void
}) {
    if (events.length === 0) return null
    return (
        <div className="space-y-2">
            <h4 className="font-medium text-muted-foreground text-sm">
                {title}
            </h4>
            <div className="space-y-1">
                {events.map((event) => (
                    <EventToggleRow
                        key={event.id}
                        event={event}
                        unavailable={selectedEvents.has(event.id)}
                        scheduledTime={scheduledTimesByEventId[event.id]}
                        onToggle={() => onToggle(event.id)}
                    />
                ))}
            </div>
        </div>
    )
}

export interface AvailabilityEventPickerProps {
    config: SeasonConfig
    /** Event ids currently marked unavailable. */
    selectedEvents: Set<number>
    onToggle: (eventId: number) => void
    /** Optional per-event scheduled time shown beside the date. */
    scheduledTimesByEventId?: Record<number, string>
    /** Drives the week 1 tryout callout wording and tone. */
    isReturningPlayer: boolean
}

/**
 * The season's dates as click-to-toggle rows, grouped into week 1 tryouts,
 * later tryouts, regular season, and playoffs. Purely presentational: the
 * caller owns the selection and the save.
 */
export function AvailabilityEventPicker({
    config,
    selectedEvents,
    onToggle,
    scheduledTimesByEventId = {},
    isReturningPlayer
}: AvailabilityEventPickerProps) {
    const tryoutEvents = getEventsByType(config, "tryout")
    const seasonEvents = getEventsByType(config, "regular_season")
    const playoffEvents = getEventsByType(config, "playoff")
    const week1Tryout = tryoutEvents[0] ?? null
    const laterTryouts = tryoutEvents.slice(1)

    return (
        <div className="space-y-6">
            {week1Tryout && (
                <Week1TryoutCallout
                    audience={isReturningPlayer ? "returning" : "new"}
                    dateLabel={formatEventDate(week1Tryout.eventDate)}
                >
                    <EventToggleRow
                        event={week1Tryout}
                        unavailable={selectedEvents.has(week1Tryout.id)}
                        scheduledTime={scheduledTimesByEventId[week1Tryout.id]}
                        onToggle={() => onToggle(week1Tryout.id)}
                        unavailableTone={isReturningPlayer ? "amber" : "red"}
                    />
                </Week1TryoutCallout>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <EventColumn
                    title="Tryouts (Weeks 2 & 3)"
                    events={laterTryouts}
                    selectedEvents={selectedEvents}
                    scheduledTimesByEventId={scheduledTimesByEventId}
                    onToggle={onToggle}
                />
                <EventColumn
                    title="Regular Season"
                    events={seasonEvents}
                    selectedEvents={selectedEvents}
                    scheduledTimesByEventId={scheduledTimesByEventId}
                    onToggle={onToggle}
                />
                <EventColumn
                    title="Playoffs"
                    events={playoffEvents}
                    selectedEvents={selectedEvents}
                    scheduledTimesByEventId={scheduledTimesByEventId}
                    onToggle={onToggle}
                />
            </div>
        </div>
    )
}
