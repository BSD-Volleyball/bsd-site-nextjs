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
import { AvailabilityEventPicker } from "@/components/availability-event-picker"
import type { SeasonConfig } from "@/lib/season-types"

interface AvailabilityFormProps {
    signupId: number | null
    config: SeasonConfig
    initialUnavailableIds: number[]
    scheduledTimesByEventId: Record<number, string>
    isReturningPlayer: boolean
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
                <AvailabilityEventPicker
                    config={config}
                    selectedEvents={selectedEvents}
                    onToggle={toggleEvent}
                    scheduledTimesByEventId={scheduledTimesByEventId}
                    isReturningPlayer={isReturningPlayer}
                />

                <div className="pt-2">
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save Availability"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
