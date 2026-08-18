"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { AvailabilityEventPicker } from "@/components/availability-event-picker"
import { Button } from "@/components/ui/button"
import type { SeasonConfig } from "@/lib/season-types"
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
    const [isReturningPlayer, setIsReturningPlayer] = useState(false)
    const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set())
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    const load = useCallback(async () => {
        setIsLoading(true)
        const result = await getUserAvailabilityForCurrentSeason(userId)
        if (result.status) {
            setConfig(result.data.config)
            setSignupId(result.data.signupId)
            setIsReturningPlayer(result.data.isReturningPlayer)
            setSelectedEvents(new Set(result.data.unavailableEventIds))
        } else {
            setConfig(null)
            toast.error(result.message)
        }
        setIsLoading(false)
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

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const result = await saveUserAvailability(
                userId,
                Array.from(selectedEvents)
            )
            if (result.status) {
                toast.success(result.message)
                await load()
            } else {
                toast.error(result.message)
            }
        } finally {
            setIsSaving(false)
        }
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
                isReturningPlayer={isReturningPlayer}
            />

            <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Availability"}
            </Button>
        </div>
    )
}
