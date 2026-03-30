"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { updatePlayerAvailability } from "./actions"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    RiCheckboxCircleLine,
    RiCloseCircleFill
} from "@remixicon/react"
import { cn } from "@/lib/utils"
import type { SeasonConfig } from "@/lib/season-types"
import { getEventsByType, formatEventDate } from "@/lib/season-utils"

interface AvailabilityFormProps {
    signupId: number
    config: SeasonConfig
    initialUnavailableIds: number[]
}

export function AvailabilityForm({
    signupId,
    config,
    initialUnavailableIds
}: AvailabilityFormProps) {
    const router = useRouter()
    const [selectedEvents, setSelectedEvents] = useState<Set<number>>(
        new Set(initialUnavailableIds)
    )
    const [isSaving, setIsSaving] = useState(false)

    const tryoutEvents = getEventsByType(config, "tryout")
    const seasonEvents = getEventsByType(config, "regular_season")
    const playoffEvents = getEventsByType(config, "playoff")

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
            const result = await updatePlayerAvailability(
                signupId,
                Array.from(selectedEvents)
            )
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
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {tryoutEvents.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="font-medium text-muted-foreground text-sm">
                                Tryouts
                            </h4>
                            <div className="space-y-1">
                                {tryoutEvents.map((event) => {
                                    const unavailable = selectedEvents.has(event.id)
                                    return (
                                        <button
                                            key={event.id}
                                            type="button"
                                            onClick={() => toggleEvent(event.id)}
                                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                                        >
                                            {unavailable ? (
                                                <RiCloseCircleFill className="h-4 w-4 shrink-0 text-red-500" />
                                            ) : (
                                                <RiCheckboxCircleLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            )}
                                            <span className={cn(unavailable && "text-red-600 dark:text-red-400")}>
                                                {formatEventDate(event.eventDate)}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {seasonEvents.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="font-medium text-muted-foreground text-sm">
                                Regular Season
                            </h4>
                            <div className="space-y-1">
                                {seasonEvents.map((event) => {
                                    const unavailable = selectedEvents.has(event.id)
                                    return (
                                        <button
                                            key={event.id}
                                            type="button"
                                            onClick={() => toggleEvent(event.id)}
                                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                                        >
                                            {unavailable ? (
                                                <RiCloseCircleFill className="h-4 w-4 shrink-0 text-red-500" />
                                            ) : (
                                                <RiCheckboxCircleLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            )}
                                            <span className={cn(unavailable && "text-red-600 dark:text-red-400")}>
                                                {formatEventDate(event.eventDate)}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {playoffEvents.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="font-medium text-muted-foreground text-sm">
                                Playoffs
                            </h4>
                            <div className="space-y-1">
                                {playoffEvents.map((event) => {
                                    const unavailable = selectedEvents.has(event.id)
                                    return (
                                        <button
                                            key={event.id}
                                            type="button"
                                            onClick={() => toggleEvent(event.id)}
                                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                                        >
                                            {unavailable ? (
                                                <RiCloseCircleFill className="h-4 w-4 shrink-0 text-red-500" />
                                            ) : (
                                                <RiCheckboxCircleLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            )}
                                            <span className={cn(unavailable && "text-red-600 dark:text-red-400")}>
                                                {formatEventDate(event.eventDate)}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {tryoutEvents.length > 0 &&
                    tryoutEvents.every((event) =>
                        selectedEvents.has(event.id)
                    ) && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            Are you sure you want to play this season? Missing
                            all 3 tryouts makes it very hard for you to be
                            placed on an appropriate team and you&apos;re very
                            likely to end up on a team in a lower division.
                        </div>
                    )}

                {selectedEvents.size >= 4 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        Are you sure you want to play this season? You&apos;ve
                        listed quite a few dates that you will miss.
                    </div>
                )}

                {playoffEvents.length > 0 &&
                    playoffEvents.every((event) =>
                        selectedEvents.has(event.id)
                    ) && (
                        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                            Are you really going to miss all of the playoff
                            matches? Captains have requested we only accept
                            players who plan to play at least 1 match of the
                            playoffs.
                        </div>
                    )}

                <div className="pt-2">
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save Availability"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
