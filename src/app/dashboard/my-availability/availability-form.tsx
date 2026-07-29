"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { updatePlayerAvailability, updateRefAvailability } from "./actions"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RiCheckboxCircleLine, RiCloseCircleFill } from "@remixicon/react"
import { cn } from "@/lib/utils"
import type { SeasonConfig, SeasonEvent } from "@/lib/season-types"
import { getEventsByType, formatEventDate } from "@/lib/season-utils"
import { Week1TryoutCallout } from "@/components/week1-tryout-callout"

interface AvailabilityFormProps {
    signupId: number | null
    config: SeasonConfig
    initialUnavailableIds: number[]
    scheduledTimesByEventId: Record<number, string>
    isReturningPlayer: boolean
}

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
                    <span className="ml-1.5 text-muted-foreground text-xs">
                        {scheduledTime}
                    </span>
                )}
            </span>
        </button>
    )
}

export function AvailabilityForm({
    signupId,
    config,
    initialUnavailableIds,
    scheduledTimesByEventId,
    isReturningPlayer
}: AvailabilityFormProps) {
    const router = useRouter()
    const [selectedEvents, setSelectedEvents] = useState<Set<number>>(
        new Set(initialUnavailableIds)
    )
    const [isSaving, setIsSaving] = useState(false)

    const tryoutEvents = getEventsByType(config, "tryout")
    const seasonEvents = getEventsByType(config, "regular_season")
    const playoffEvents = getEventsByType(config, "playoff")
    const week1Tryout = tryoutEvents[0] ?? null
    const laterTryouts = tryoutEvents.slice(1)

    const toggleEvent = (eventId: number) => {
        setSelectedEvents((prev) => {
            const next = new Set(prev)
            if (next.has(eventId)) {
                next.delete(eventId)
            } else {
                next.add(eventId)
            }
            return next
        })
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const result =
                signupId !== null
                    ? await updatePlayerAvailability(
                          signupId,
                          Array.from(selectedEvents)
                      )
                    : await updateRefAvailability(Array.from(selectedEvents))
            if (result.status) {
                toast.success(result.message)
                router.refresh()
            } else {
                toast.error(result.message)
            }
        } catch {
            toast.error("Something went wrong. Please try again.")
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>My Availability</CardTitle>
                <CardDescription>
                    Select which dates you will <strong>NOT</strong> be able to
                    play this season. Your changes will be saved immediately
                    when you click Save.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {week1Tryout && (
                    <Week1TryoutCallout
                        audience={isReturningPlayer ? "returning" : "new"}
                        dateLabel={formatEventDate(week1Tryout.eventDate)}
                    >
                        <EventToggleRow
                            event={week1Tryout}
                            unavailable={selectedEvents.has(week1Tryout.id)}
                            scheduledTime={
                                scheduledTimesByEventId[week1Tryout.id]
                            }
                            onToggle={() => toggleEvent(week1Tryout.id)}
                            unavailableTone={
                                isReturningPlayer ? "amber" : "red"
                            }
                        />
                    </Week1TryoutCallout>
                )}

                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {laterTryouts.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="font-medium text-muted-foreground text-sm">
                                Tryouts (Weeks 2 &amp; 3)
                            </h4>
                            <div className="space-y-1">
                                {laterTryouts.map((event) => (
                                    <EventToggleRow
                                        key={event.id}
                                        event={event}
                                        unavailable={selectedEvents.has(
                                            event.id
                                        )}
                                        scheduledTime={
                                            scheduledTimesByEventId[event.id]
                                        }
                                        onToggle={() => toggleEvent(event.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {seasonEvents.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="font-medium text-muted-foreground text-sm">
                                Regular Season
                            </h4>
                            <div className="space-y-1">
                                {seasonEvents.map((event) => (
                                    <EventToggleRow
                                        key={event.id}
                                        event={event}
                                        unavailable={selectedEvents.has(
                                            event.id
                                        )}
                                        scheduledTime={
                                            scheduledTimesByEventId[event.id]
                                        }
                                        onToggle={() => toggleEvent(event.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {playoffEvents.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="font-medium text-muted-foreground text-sm">
                                Playoffs
                            </h4>
                            <div className="space-y-1">
                                {playoffEvents.map((event) => (
                                    <EventToggleRow
                                        key={event.id}
                                        event={event}
                                        unavailable={selectedEvents.has(
                                            event.id
                                        )}
                                        scheduledTime={
                                            scheduledTimesByEventId[event.id]
                                        }
                                        onToggle={() => toggleEvent(event.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="pt-2">
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save Availability"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
