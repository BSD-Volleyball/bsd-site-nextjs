"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
    saveSeasonConfig,
    type SeasonConfigData,
    type EventType,
    type EventData,
    type TimeSlotData
} from "./actions"

interface TimeSlotState {
    key: string
    start_time: string
    slot_label: string
    sort_order: number
}

interface EventState {
    key: string
    event_type: EventType
    event_date: string
    sort_order: number
    label: string
    time_slots: TimeSlotState[]
}

interface SeasonConfigFormProps {
    initialData: SeasonConfigData
}

const EVENT_TYPE_CONFIG: Record<
    EventType,
    { title: string; hasTimeSlots: boolean; description: string }
> = {
    tryout: {
        title: "Tryouts",
        hasTimeSlots: true,
        description: "Each tryout date has its own time slots"
    },
    regular_season: {
        title: "Regular Season",
        hasTimeSlots: true,
        description:
            "Weekly game dates with shared time slots (shown on first event)"
    },
    playoff: {
        title: "Playoffs",
        hasTimeSlots: false,
        description: "Playoff round dates"
    },
    draft: {
        title: "Drafts",
        hasTimeSlots: false,
        description: "Draft date per division level"
    },
    captain_select: {
        title: "Captain Selection",
        hasTimeSlots: false,
        description: "Date when captains are selected"
    },
    late_date: {
        title: "Late Registration",
        hasTimeSlots: false,
        description: "Late registration pricing deadline"
    }
}

const EVENT_TYPE_ORDER: EventType[] = [
    "tryout",
    "regular_season",
    "playoff",
    "draft",
    "captain_select",
    "late_date"
]

let keyCounter = 0
function nextKey(): string {
    keyCounter += 1
    return `k_${keyCounter}`
}

function buildInitialEvents(data: SeasonConfigData): EventState[] {
    return data.events.map((e) => ({
        key: nextKey(),
        event_type: e.event_type,
        event_date: e.event_date,
        sort_order: e.sort_order,
        label: e.label || "",
        time_slots: e.time_slots.map((ts) => ({
            key: nextKey(),
            start_time: ts.start_time.slice(0, 5),
            slot_label: ts.slot_label || "",
            sort_order: ts.sort_order
        }))
    }))
}

export function SeasonConfigForm({ initialData }: SeasonConfigFormProps) {
    const router = useRouter()
    const [saving, setSaving] = useState(false)

    const [seasonAmount, setSeasonAmount] = useState(
        initialData.season_amount || ""
    )
    const [lateAmount, setLateAmount] = useState(initialData.late_amount || "")
    const [maxPlayers, setMaxPlayers] = useState(
        initialData.max_players?.toString() || ""
    )

    const [events, setEvents] = useState<EventState[]>(() =>
        buildInitialEvents(initialData)
    )

    const getEventsByType = useCallback(
        (type: EventType) =>
            events
                .filter((e) => e.event_type === type)
                .sort((a, b) => a.sort_order - b.sort_order),
        [events]
    )

    function addEvent(type: EventType) {
        const existing = events.filter((e) => e.event_type === type)
        const maxOrder = existing.reduce(
            (max, e) => Math.max(max, e.sort_order),
            0
        )
        setEvents((prev) => [
            ...prev,
            {
                key: nextKey(),
                event_type: type,
                event_date: "",
                sort_order: maxOrder + 1,
                label: "",
                time_slots: []
            }
        ])
    }

    function removeEvent(key: string) {
        setEvents((prev) => prev.filter((e) => e.key !== key))
    }

    function updateEvent(
        key: string,
        field: "event_date" | "label",
        value: string
    ) {
        setEvents((prev) =>
            prev.map((e) => (e.key === key ? { ...e, [field]: value } : e))
        )
    }

    function addTimeSlot(eventKey: string) {
        setEvents((prev) =>
            prev.map((e) => {
                if (e.key !== eventKey) return e
                const maxOrder = e.time_slots.reduce(
                    (max, ts) => Math.max(max, ts.sort_order),
                    0
                )
                return {
                    ...e,
                    time_slots: [
                        ...e.time_slots,
                        {
                            key: nextKey(),
                            start_time: "",
                            slot_label: "",
                            sort_order: maxOrder + 1
                        }
                    ]
                }
            })
        )
    }

    function removeTimeSlot(eventKey: string, slotKey: string) {
        setEvents((prev) =>
            prev.map((e) => {
                if (e.key !== eventKey) return e
                return {
                    ...e,
                    time_slots: e.time_slots.filter((ts) => ts.key !== slotKey)
                }
            })
        )
    }

    function updateTimeSlot(
        eventKey: string,
        slotKey: string,
        field: "start_time" | "slot_label",
        value: string
    ) {
        setEvents((prev) =>
            prev.map((e) => {
                if (e.key !== eventKey) return e
                return {
                    ...e,
                    time_slots: e.time_slots.map((ts) =>
                        ts.key === slotKey ? { ...ts, [field]: value } : ts
                    )
                }
            })
        )
    }

    async function handleSave() {
        // Validate events have dates
        const eventsWithoutDates = events.filter((e) => !e.event_date)
        if (eventsWithoutDates.length > 0) {
            toast.error("All events must have a date")
            return
        }

        // Validate time slots have start times
        const slotsWithoutTimes = events.some((e) =>
            e.time_slots.some((ts) => !ts.start_time)
        )
        if (slotsWithoutTimes) {
            toast.error("All time slots must have a start time")
            return
        }

        setSaving(true)

        // Reassign sort_order based on current position
        const eventData: EventData[] = []
        for (const type of EVENT_TYPE_ORDER) {
            const typeEvents = events.filter((e) => e.event_type === type)
            typeEvents.forEach((e, idx) => {
                const timeSlots: TimeSlotData[] = e.time_slots.map(
                    (ts, tsIdx) => ({
                        start_time: ts.start_time,
                        slot_label: ts.slot_label || null,
                        sort_order: tsIdx + 1
                    })
                )
                eventData.push({
                    event_type: e.event_type,
                    event_date: e.event_date,
                    sort_order: idx + 1,
                    label: e.label || null,
                    time_slots: timeSlots
                })
            })
        }

        const result = await saveSeasonConfig(
            initialData.seasonId,
            {
                season_amount: seasonAmount,
                late_amount: lateAmount,
                max_players: maxPlayers ? Number.parseInt(maxPlayers, 10) : null
            },
            eventData
        )

        if (result.status) {
            toast.success(result.message)
            router.refresh()
        } else {
            toast.error(result.message)
        }

        setSaving(false)
    }

    const seasonLabel = `${initialData.seasonName.charAt(0).toUpperCase() + initialData.seasonName.slice(1)} ${initialData.year}`

    return (
        <div className="space-y-6">
            {/* Season Metadata */}
            <Card>
                <CardHeader>
                    <CardTitle>
                        {seasonLabel} — {initialData.code}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                        <span className="text-muted-foreground text-sm">
                            Phase:
                        </span>
                        <span className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground text-sm">
                            {initialData.phase.replace(/_/g, " ")}
                        </span>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="season-amount">
                                Season Amount ($)
                            </Label>
                            <Input
                                id="season-amount"
                                type="text"
                                inputMode="decimal"
                                value={seasonAmount}
                                onChange={(e) =>
                                    setSeasonAmount(e.target.value)
                                }
                                placeholder="0.00"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="late-amount">Late Amount ($)</Label>
                            <Input
                                id="late-amount"
                                type="text"
                                inputMode="decimal"
                                value={lateAmount}
                                onChange={(e) => setLateAmount(e.target.value)}
                                placeholder="0.00"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="max-players">Max Players</Label>
                            <Input
                                id="max-players"
                                type="number"
                                value={maxPlayers}
                                onChange={(e) => setMaxPlayers(e.target.value)}
                                placeholder="e.g. 120"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Event Sections */}
            {EVENT_TYPE_ORDER.map((type) => {
                const config = EVENT_TYPE_CONFIG[type]
                const typeEvents = getEventsByType(type)

                return (
                    <Card key={type}>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">
                                        {config.title}
                                    </CardTitle>
                                    <p className="text-muted-foreground text-sm">
                                        {config.description}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => addEvent(type)}
                                >
                                    + Add Event
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {typeEvents.length === 0 && (
                                <p className="text-muted-foreground text-sm">
                                    No {config.title.toLowerCase()} events
                                    configured.
                                </p>
                            )}
                            {typeEvents.map((event, eventIdx) => (
                                <div
                                    key={event.key}
                                    className="space-y-3 rounded-lg border p-4"
                                >
                                    <div className="flex items-end gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs">
                                            {eventIdx + 1}
                                        </span>
                                        <div className="flex-1 space-y-1">
                                            <Label>Date</Label>
                                            <Input
                                                type="date"
                                                value={event.event_date}
                                                onChange={(e) =>
                                                    updateEvent(
                                                        event.key,
                                                        "event_date",
                                                        e.target.value
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <Label>Label (optional)</Label>
                                            <Input
                                                type="text"
                                                value={event.label}
                                                onChange={(e) =>
                                                    updateEvent(
                                                        event.key,
                                                        "label",
                                                        e.target.value
                                                    )
                                                }
                                                placeholder={`${config.title} ${eventIdx + 1}`}
                                            />
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-destructive"
                                            onClick={() =>
                                                removeEvent(event.key)
                                            }
                                        >
                                            Remove
                                        </Button>
                                    </div>

                                    {/* Time Slots */}
                                    {config.hasTimeSlots && (
                                        <div className="ml-9 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-sm">
                                                    Time Slots
                                                </span>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                        addTimeSlot(event.key)
                                                    }
                                                >
                                                    + Add Slot
                                                </Button>
                                            </div>
                                            {event.time_slots.length === 0 && (
                                                <p className="text-muted-foreground text-xs">
                                                    No time slots added.
                                                </p>
                                            )}
                                            {event.time_slots.map((slot) => (
                                                <div
                                                    key={slot.key}
                                                    className="flex items-end gap-2"
                                                >
                                                    <div className="w-36 space-y-1">
                                                        <Label>
                                                            Start Time
                                                        </Label>
                                                        <Input
                                                            type="time"
                                                            value={
                                                                slot.start_time
                                                            }
                                                            onChange={(e) =>
                                                                updateTimeSlot(
                                                                    event.key,
                                                                    slot.key,
                                                                    "start_time",
                                                                    e.target
                                                                        .value
                                                                )
                                                            }
                                                        />
                                                    </div>
                                                    <div className="flex-1 space-y-1">
                                                        <Label>
                                                            Label (optional)
                                                        </Label>
                                                        <Input
                                                            type="text"
                                                            value={
                                                                slot.slot_label
                                                            }
                                                            onChange={(e) =>
                                                                updateTimeSlot(
                                                                    event.key,
                                                                    slot.key,
                                                                    "slot_label",
                                                                    e.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder="e.g. Court A"
                                                        />
                                                    </div>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-destructive"
                                                        onClick={() =>
                                                            removeTimeSlot(
                                                                event.key,
                                                                slot.key
                                                            )
                                                        }
                                                    >
                                                        ×
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )
            })}

            {/* Save Button */}
            <div className="flex justify-end">
                <Button size="lg" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Configuration"}
                </Button>
            </div>
        </div>
    )
}
