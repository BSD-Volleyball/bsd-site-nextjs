"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import {
    updateWeek1Rosters,
    type Week1EditablePlayer,
    type Week1EditableSlot
} from "./actions"

interface EditWeek1FormProps {
    players: Week1EditablePlayer[]
    slots: Week1EditableSlot[]
}

function getPlayerLabel(player: Week1EditablePlayer) {
    if (player.preferredName) {
        return `${player.preferredName} ${player.lastName}`
    }
    return `${player.firstName} ${player.lastName}`
}

function PlayerCombobox({
    players,
    value,
    onChange,
    excludeIds = []
}: {
    players: Week1EditablePlayer[]
    value: string
    onChange: (userId: string) => void
    excludeIds?: string[]
}) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    const selectedPlayer = useMemo(
        () => players.find((player) => player.id === value) || null,
        [players, value]
    )

    const filteredPlayers = useMemo(() => {
        const available = players.filter(
            (player) => !excludeIds.includes(player.id) || player.id === value
        )
        if (!search) {
            return available
        }

        const lower = search.toLowerCase()
        return available.filter((player) => {
            return getPlayerLabel(player).toLowerCase().includes(lower)
        })
    }, [players, search, excludeIds, value])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    <span
                        className={cn(
                            "truncate",
                            !selectedPlayer && "text-muted-foreground"
                        )}
                    >
                        {selectedPlayer
                            ? getPlayerLabel(selectedPlayer)
                            : "Select player..."}
                    </span>
                    <div className="flex items-center gap-1">
                        {selectedPlayer && (
                            <span
                                role="button"
                                tabIndex={0}
                                className="rounded-sm p-0.5 hover:bg-accent"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setOpen(false)
                                    onChange("")
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.stopPropagation()
                                        setOpen(false)
                                        onChange("")
                                    }
                                }}
                            >
                                <RiCloseLine className="h-4 w-4 text-muted-foreground" />
                            </span>
                        )}
                        <RiArrowDownSLine className="h-4 w-4 text-muted-foreground" />
                    </div>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-(--radix-popover-trigger-width) p-2"
                align="start"
            >
                <Input
                    placeholder="Search players..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="mb-2"
                />
                <div className="max-h-60 overflow-y-auto">
                    {filteredPlayers.length === 0 ? (
                        <p className="py-2 text-center text-muted-foreground text-sm">
                            No players found
                        </p>
                    ) : (
                        filteredPlayers.map((player) => (
                            <button
                                key={player.id}
                                type="button"
                                className={cn(
                                    "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                                    value === player.id && "bg-accent"
                                )}
                                onClick={() => {
                                    onChange(player.id)
                                    setOpen(false)
                                    setSearch("")
                                }}
                            >
                                {getPlayerLabel(player)}
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

export function EditWeek1Form({ players, slots }: EditWeek1FormProps) {
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [slotAssignments, setSlotAssignments] = useState(() =>
        slots.map((slot) => ({ ...slot }))
    )

    const selectedUserIds = useMemo(
        () => slotAssignments.map((slot) => slot.userId).filter(Boolean),
        [slotAssignments]
    )

    const groupedSlots = useMemo(() => {
        const sessionMap = new Map<
            number,
            Map<number, typeof slotAssignments>
        >()

        for (const slot of slotAssignments) {
            const courtMap =
                sessionMap.get(slot.sessionNumber) ||
                new Map<number, typeof slotAssignments>()
            const list = courtMap.get(slot.courtNumber) || []
            list.push(slot)
            courtMap.set(slot.courtNumber, list)
            sessionMap.set(slot.sessionNumber, courtMap)
        }

        for (const courtMap of sessionMap.values()) {
            for (const [court, list] of courtMap.entries()) {
                courtMap.set(
                    court,
                    [...list].sort((a, b) => a.id - b.id)
                )
            }
        }

        return [...sessionMap.entries()].sort((a, b) => a[0] - b[0])
    }, [slotAssignments])

    const onChangeSlot = (slotId: number, userId: string) => {
        setSlotAssignments((prev) =>
            prev.map((slot) =>
                slot.id === slotId ? { ...slot, userId } : slot
            )
        )
    }

    const handleSubmit = async () => {
        setError(null)
        setSuccess(null)

        if (slotAssignments.some((slot) => !slot.userId)) {
            setError("All slots must have a player selected.")
            return
        }

        setIsSaving(true)

        const result = await updateWeek1Rosters(
            slotAssignments.map((slot) => ({
                id: slot.id,
                userId: slot.userId
            }))
        )

        if (result.status) {
            setSuccess(result.message)
        } else {
            setError(result.message)
        }

        setIsSaving(false)
    }

    return (
        <div className="space-y-6">
            {groupedSlots.map(([sessionNumber, courtMap]) => (
                <Card key={`session-${sessionNumber}`}>
                    <CardHeader>
                        <CardTitle>Session {sessionNumber}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            {[1, 2, 3, 4].map((courtNumber) => {
                                const courtSlots =
                                    courtMap.get(courtNumber) || []

                                return (
                                    <div
                                        key={`session-${sessionNumber}-court-${courtNumber}`}
                                        className="space-y-2 rounded-md border p-3"
                                    >
                                        <h3 className="font-semibold text-sm">
                                            Court {courtNumber}
                                        </h3>
                                        {courtSlots.length === 0 ? (
                                            <p className="text-muted-foreground text-xs">
                                                No slots found.
                                            </p>
                                        ) : (
                                            <div className="space-y-2">
                                                {courtSlots.map((slot, idx) => (
                                                    <div
                                                        key={slot.id}
                                                        className="space-y-1"
                                                    >
                                                        <p className="text-muted-foreground text-xs">
                                                            Slot {idx + 1}
                                                        </p>
                                                        <PlayerCombobox
                                                            players={players}
                                                            value={slot.userId}
                                                            onChange={(
                                                                userId
                                                            ) =>
                                                                onChangeSlot(
                                                                    slot.id,
                                                                    userId
                                                                )
                                                            }
                                                            excludeIds={selectedUserIds.filter(
                                                                (id) =>
                                                                    id !==
                                                                    slot.userId
                                                            )}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            ))}

            <div className="flex items-center gap-3">
                <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSaving}
                >
                    {isSaving ? "Updating..." : "Update Week 1"}
                </Button>
                {success && (
                    <span className="text-green-700 text-sm dark:text-green-300">
                        {success}
                    </span>
                )}
                {error && (
                    <span className="text-red-700 text-sm dark:text-red-300">
                        {error}
                    </span>
                )}
            </div>
        </div>
    )
}
