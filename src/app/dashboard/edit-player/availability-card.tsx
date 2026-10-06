"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { AvailabilityEventPicker } from "@/components/availability-event-picker"
import { useAction } from "@/components/hooks/use-action"
import { Button } from "@/components/ui/button"
import type { SeasonConfig } from "@/lib/season-types"
import type { Week1Audience } from "@/lib/week1-priority"
import {
    getUserAvailabilityForCurrentSeason,
    saveUserAvailability
} from "./actions"

interface AvailabilityCardProps {
    userId: string
}

/**
 * Admin editor for one player's current-season availability. Loads when a
 * player is selected and saves through the admin action, which audits the
 * change and notifies the player's captains just like a self-service edit.
 */
export function AvailabilityCard({ userId }: AvailabilityCardProps) {
    const [config, setConfig] = useState<SeasonConfig | null>(null)
    const [signupId, setSignupId] = useState<number | null>(null)
    const [week1Audience, setWeek1Audience] = useState<Week1Audience>("new")
    const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set())
    const [isLoading, setIsLoading] = useState(true)

    const load = useCallback(async () => {
        setIsLoading(true)
        try {
            const result = await getUserAvailabilityForCurrentSeason(userId)
            if (result.status) {
                setConfig(result.data.config)
                setSignupId(result.data.signupId)
                setWeek1Audience(result.data.week1Audience)
                setSelectedEvents(new Set(result.data.unavailableEventIds))
            } else {
                setConfig(null)
                toast.error(result.message)
            }
        } catch {
            setConfig(null)
            toast.error("Something went wrong. Please try again.")
        } finally {
            setIsLoading(false)
        }
    }, [userId])

    useEffect(() => {
        void load()
    }, [load])

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

    const { run: save, pending: isSaving } = useAction(saveUserAvailability, {
        refresh: false,
        onSuccess: () => void load()
    })

    const handleSave = () => {
        void save(userId, Array.from(selectedEvents))
    }

    if (isLoading) {
        return (
            <p className="text-muted-foreground text-sm">
                Loading availability...
            </p>
        )
    }

    if (!config) {
        return (
            <p className="text-muted-foreground text-sm">
                Availability could not be loaded.
            </p>
        )
    }

    return (
        <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
                Toggle the dates this player will <strong>NOT</strong> be
                available. Saving updates their responses immediately and emails
                their captain(s) the change.
                {signupId === null && (
                    <>
                        {" "}
                        This player has no signup for the current season, so the
                        dates are saved against the account only (as for refs).
                    </>
                )}
            </p>

            <AvailabilityEventPicker
                config={config}
                selectedEvents={selectedEvents}
                onToggle={toggleEvent}
                week1Audience={week1Audience}
            />

            <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Availability"}
            </Button>
        </div>
    )
}
