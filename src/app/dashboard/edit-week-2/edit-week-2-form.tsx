"use client"

import { useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
    RiAddLine,
    RiArrowDownSLine,
    RiCloseLine,
    RiDeleteBinLine,
    RiUserLine
} from "@remixicon/react"
import {
    updateWeek2Rosters,
    type Week2EditablePlayer,
    type Week2EditableSlot
} from "./actions"
import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup
} from "@/components/player-detail"

interface EditWeek2FormProps {
    players: Week2EditablePlayer[]
    slots: Week2EditableSlot[]
    playerPicUrl: string
}

interface LocalSlot {
    localKey: string
    divisionId: number
    divisionName: string
    teamNumber: number
    userId: string
    isCaptain: boolean
}

function getPlayerLabel(player: Week2EditablePlayer) {
    const name = player.preferredName
        ? `${player.preferredName} ${player.lastName}`
        : `${player.firstName} ${player.lastName}`
    return player.hasPairPick ? `${name} [PP]` : name
}

function getGenderClass(male: boolean | null) {
    if (male === true) return "bg-blue-50 dark:bg-blue-950/40"
    if (male === false) return "bg-pink-50 dark:bg-pink-950/40"
    return ""
}

function PlayerCombobox({
    players,
    value,
    onChange,
    excludeIds = [],
    disabled = false
}: {
    players: Week2EditablePlayer[]
    value: string
    onChange: (userId: string) => void
    excludeIds?: string[]
    disabled?: boolean
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
                    className={cn(
                        "w-full justify-between font-normal",
                        selectedPlayer && getGenderClass(selectedPlayer.male)
                    )}
                    disabled={disabled}
                >
                    {selectedPlayer ? (
                        <span className="flex min-w-0 flex-1 items-baseline gap-2 truncate">
                            <span className="truncate">
                                {getPlayerLabel(selectedPlayer)}
                            </span>
                            <span className="shrink-0 text-muted-foreground text-xs">
                                {selectedPlayer.seasonsPlayedCount === 0 ? (
                                    <span className="font-semibold text-green-600 dark:text-green-400">
                                        NEW
                                    </span>
                                ) : selectedPlayer.lastDivisionName ? (
                                    <span>
                                        {selectedPlayer.lastDivisionName}
                                    </span>
                                ) : null}
                                <span className="ml-1">
                                    {Math.round(selectedPlayer.placementScore)}
                                </span>
                                {selectedPlayer.seasonsPlayedCount > 0 &&
                                    selectedPlayer.ratingScore !== null && (
                                        <span className="ml-1 text-amber-600 dark:text-amber-400">
                                            R
                                            {Math.round(
                                                selectedPlayer.ratingScore
                                            )}
                                        </span>
                                    )}
                            </span>
                        </span>
                    ) : (
                        <span className="truncate text-muted-foreground">
                            Select player...
                        </span>
                    )}
                    <div className="flex items-center gap-1">
                        {selectedPlayer && !disabled && (
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
                                    "w-full rounded-sm px-2 py-1.5 text-left text-sm",
                                    value === player.id
                                        ? "bg-accent"
                                        : player.male === true
                                          ? "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/60"
                                          : player.male === false
                                            ? "bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 dark:hover:bg-pink-950/60"
                                            : "hover:bg-accent"
                                )}
                                onClick={() => {
                                    onChange(player.id)
                                    setOpen(false)
                                    setSearch("")
                                }}
                            >
                                <span className="flex items-baseline justify-between gap-2">
                                    <span>{getPlayerLabel(player)}</span>
                                    <span className="shrink-0 text-muted-foreground text-xs">
                                        {player.seasonsPlayedCount === 0 ? (
                                            <span className="font-semibold text-green-600 dark:text-green-400">
                                                NEW
                                            </span>
                                        ) : player.lastDivisionName ? (
                                            <span>
                                                {player.lastDivisionName}
                                            </span>
                                        ) : null}
                                        <span className="ml-1">
                                            {Math.round(player.placementScore)}
                                        </span>
                                        {player.seasonsPlayedCount > 0 &&
                                            player.ratingScore !== null && (
                                                <span className="ml-1 text-amber-600 dark:text-amber-400">
                                                    R
                                                    {Math.round(
                                                        player.ratingScore
                                                    )}
                                                </span>
                                            )}
                                    </span>
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

export function EditWeek2Form({
    players,
    slots,
    playerPicUrl
}: EditWeek2FormProps) {
    const modal = usePlayerDetailModal()
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const nextKey = useRef(0)

    const [slotAssignments, setSlotAssignments] = useState<LocalSlot[]>(() =>
        slots.map((slot) => ({
            localKey: `db-${slot.id}`,
            divisionId: slot.divisionId,
            divisionName: slot.divisionName,
            teamNumber: slot.teamNumber,
            userId: slot.userId,
            isCaptain: slot.isCaptain
        }))
    )

    const duplicateUserIds = useMemo(() => {
        const counts = new Map<string, number>()
        for (const slot of slotAssignments) {
            if (slot.userId) {
                counts.set(slot.userId, (counts.get(slot.userId) || 0) + 1)
            }
        }
        return new Set(
            [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id)
        )
    }, [slotAssignments])

    const groupedSlots = useMemo(() => {
        const divisionMap = new Map<
            number,
            {
                divisionName: string
                teams: Map<number, LocalSlot[]>
            }
        >()

        for (const slot of slotAssignments) {
            const current = divisionMap.get(slot.divisionId) || {
                divisionName: slot.divisionName,
                teams: new Map<number, LocalSlot[]>()
            }

            const teamSlots = current.teams.get(slot.teamNumber) || []
            teamSlots.push(slot)
            current.teams.set(slot.teamNumber, teamSlots)
            divisionMap.set(slot.divisionId, current)
        }

        return [...divisionMap.entries()].sort((a, b) => a[0] - b[0])
    }, [slotAssignments])

    const addSlot = (
        divisionId: number,
        divisionName: string,
        teamNumber: number
    ) => {
        const key = `new-${nextKey.current++}`
        setSlotAssignments((prev) => [
            ...prev,
            {
                localKey: key,
                divisionId,
                divisionName,
                teamNumber,
                userId: "",
                isCaptain: false
            }
        ])
    }

    const removeSlot = (localKey: string) => {
        setSlotAssignments((prev) =>
            prev.filter((slot) => slot.localKey !== localKey)
        )
    }

    const onChangeSlot = (localKey: string, userId: string) => {
        setSlotAssignments((prev) =>
            prev.map((slot) =>
                slot.localKey === localKey ? { ...slot, userId } : slot
            )
        )
    }

    const handleSubmit = async () => {
        setError(null)
        setSuccess(null)
        setIsSaving(true)

        const filledSlots = slotAssignments.filter((slot) => slot.userId)
        const result = await updateWeek2Rosters(
            filledSlots.map((slot) => ({
                divisionId: slot.divisionId,
                teamNumber: slot.teamNumber,
                userId: slot.userId,
                isCaptain: slot.isCaptain
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
            {groupedSlots.map(([divisionId, divisionData]) => (
                <Card key={`division-${divisionId}`}>
                    <CardHeader>
                        <CardTitle>{divisionData.divisionName}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {Array.from(divisionData.teams.entries()).map(
                                ([teamNumber, teamSlots]) => (
                                    <div
                                        key={`division-${divisionId}-team-${teamNumber}`}
                                        className="space-y-2 rounded-md border p-3"
                                    >
                                        <h3 className="font-semibold text-sm">
                                            Team {teamNumber}
                                        </h3>
                                        <div className="space-y-2">
                                            {teamSlots.map((slot, idx) => (
                                                <div
                                                    key={slot.localKey}
                                                    className="flex items-end gap-1"
                                                >
                                                    <div className="min-w-0 flex-1 space-y-1">
                                                        <p className="text-muted-foreground text-xs">
                                                            Slot {idx + 1}
                                                            {slot.isCaptain && (
                                                                <span className="ml-2 font-semibold text-primary">
                                                                    Captain slot
                                                                </span>
                                                            )}
                                                        </p>
                                                        <PlayerCombobox
                                                            players={players}
                                                            value={slot.userId}
                                                            onChange={(
                                                                userId
                                                            ) =>
                                                                onChangeSlot(
                                                                    slot.localKey,
                                                                    userId
                                                                )
                                                            }
                                                            disabled={
                                                                slot.isCaptain
                                                            }
                                                        />
                                                        {slot.userId &&
                                                            duplicateUserIds.has(
                                                                slot.userId
                                                            ) && (
                                                                <p className="text-amber-600 text-xs dark:text-amber-400">
                                                                    Playing
                                                                    twice
                                                                </p>
                                                            )}
                                                    </div>
                                                    {slot.userId && (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="shrink-0"
                                                            onClick={() =>
                                                                modal.openPlayerDetail(
                                                                    slot.userId
                                                                )
                                                            }
                                                        >
                                                            <RiUserLine className="h-4 w-4 text-muted-foreground" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="shrink-0"
                                                        onClick={() =>
                                                            removeSlot(
                                                                slot.localKey
                                                            )
                                                        }
                                                    >
                                                        <RiDeleteBinLine className="h-4 w-4 text-muted-foreground" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="w-full"
                                            onClick={() =>
                                                addSlot(
                                                    divisionId,
                                                    divisionData.divisionName,
                                                    teamNumber
                                                )
                                            }
                                        >
                                            <RiAddLine className="mr-1 h-4 w-4" />
                                            Add Player
                                        </Button>
                                    </div>
                                )
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}

            <div className="flex flex-wrap items-center gap-3">
                <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSaving}
                >
                    {isSaving ? "Saving..." : "Save Week 2"}
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

            <AdminPlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={modal.closePlayerDetail}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                signupHistory={modal.signupHistory}
                playerPicUrl={playerPicUrl}
                isLoading={modal.isLoading}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
                viewerRating={modal.viewerRating}
            />
        </div>
    )
}
