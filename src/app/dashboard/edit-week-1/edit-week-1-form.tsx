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
    updateWeek1Rosters,
    sendWeek1RosterNotifications,
    type Week1EditablePlayer,
    type Week1EditableSlot
} from "./actions"
import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup
} from "@/components/player-detail"
import {
    RosterNotificationDialog,
    type RosterChangeEntry
} from "@/components/roster-notification"

interface EditWeek1FormProps {
    players: Week1EditablePlayer[]
    slots: Week1EditableSlot[]
    playerPicUrl: string
    seasonLabel: string
}

interface LocalSlot {
    localKey: string
    sessionNumber: number
    courtNumber: number
    userId: string
}

function getPlayerLabel(player: Week1EditablePlayer) {
    const name = player.preferredName
        ? `${player.preferredName} ${player.lastName}`
        : `${player.firstName} ${player.lastName}`
    return `${name} (${Math.round(player.placementScore)})`
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
                    className={cn(
                        "w-full justify-between font-normal",
                        selectedPlayer && getGenderClass(selectedPlayer.male)
                    )}
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
                                {getPlayerLabel(player)}
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

function UnassignedWeek1Players({
    players,
    assignedUserIds,
    onPlayerClick
}: {
    players: Week1EditablePlayer[]
    assignedUserIds: string[]
    onPlayerClick: (userId: string) => void
}) {
    const unassigned = useMemo(
        () =>
            players
                .filter(
                    (p) => p.playFirstWeek && !assignedUserIds.includes(p.id)
                )
                .sort((a, b) => {
                    return a.placementScore - b.placementScore
                }),
        [players, assignedUserIds]
    )

    if (unassigned.length === 0) return null

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    Unassigned Week 1 Players ({unassigned.length})
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-2">
                    {unassigned.map((player) => (
                        <button
                            key={player.id}
                            type="button"
                            onClick={() => onPlayerClick(player.id)}
                            className={cn(
                                "rounded-md border px-2 py-1 text-left text-sm transition-opacity hover:opacity-80",
                                player.male === true
                                    ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40"
                                    : player.male === false
                                      ? "border-pink-300 bg-pink-50 dark:border-pink-800 dark:bg-pink-950/40"
                                      : "border-border bg-muted"
                            )}
                        >
                            {getPlayerLabel(player)}
                            <span className="ml-1.5 text-muted-foreground text-xs">
                                {player.seasonsPlayed === 0
                                    ? "new"
                                    : `${player.seasonsPlayed}s`}
                            </span>
                        </button>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}

function computeWeek1Diff(
    oldSlots: LocalSlot[],
    newSlots: LocalSlot[],
    players: Week1EditablePlayer[]
): RosterChangeEntry[] {
    const playerName = (userId: string) => {
        const p = players.find((pl) => pl.id === userId)
        if (!p) return userId
        return p.preferredName
            ? `${p.preferredName} ${p.lastName}`
            : `${p.firstName} ${p.lastName}`
    }

    const oldByUser = new Map(
        oldSlots
            .filter((s) => s.userId)
            .map((s) => [
                s.userId,
                { sessionNumber: s.sessionNumber, courtNumber: s.courtNumber }
            ])
    )
    const newByUser = new Map(
        newSlots
            .filter((s) => s.userId)
            .map((s) => [
                s.userId,
                { sessionNumber: s.sessionNumber, courtNumber: s.courtNumber }
            ])
    )

    const changes: RosterChangeEntry[] = []

    for (const [userId, newAssignment] of newByUser) {
        const oldAssignment = oldByUser.get(userId)
        if (!oldAssignment) {
            changes.push({
                userId,
                displayName: playerName(userId),
                changeKind: "added",
                week1Assignment: newAssignment,
                divisionAssignments: null
            })
        } else if (
            oldAssignment.sessionNumber !== newAssignment.sessionNumber ||
            oldAssignment.courtNumber !== newAssignment.courtNumber
        ) {
            changes.push({
                userId,
                displayName: playerName(userId),
                changeKind: "changed",
                week1Assignment: newAssignment,
                divisionAssignments: null
            })
        }
    }

    for (const [userId] of oldByUser) {
        if (!newByUser.has(userId)) {
            changes.push({
                userId,
                displayName: playerName(userId),
                changeKind: "removed",
                week1Assignment: null,
                divisionAssignments: null
            })
        }
    }

    return changes
}

export function EditWeek1Form({
    players,
    slots,
    playerPicUrl,
    seasonLabel
}: EditWeek1FormProps) {
    const modal = usePlayerDetailModal()
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [notifyDialogOpen, setNotifyDialogOpen] = useState(false)
    const [pendingChanges, setPendingChanges] = useState<RosterChangeEntry[]>(
        []
    )
    const [isSendingNotifications, setIsSendingNotifications] = useState(false)
    const nextKey = useRef(0)

    const toLocalSlots = (rawSlots: typeof slots): LocalSlot[] =>
        rawSlots.map((slot) => ({
            localKey: `db-${slot.id}`,
            sessionNumber: slot.sessionNumber,
            courtNumber: slot.courtNumber,
            userId: slot.userId
        }))

    const [slotAssignments, setSlotAssignments] = useState<LocalSlot[]>(() =>
        toLocalSlots(slots)
    )

    // Tracks the last successfully saved state for diff computation
    const lastSavedSlots = useRef<LocalSlot[]>(toLocalSlots(slots))

    const selectedUserIds = useMemo(
        () => slotAssignments.map((slot) => slot.userId).filter(Boolean),
        [slotAssignments]
    )

    const groupedSlots = useMemo(() => {
        const sessionMap = new Map<number, Map<number, LocalSlot[]>>()

        for (const slot of slotAssignments) {
            if (slot.sessionNumber === 3) continue
            const courtMap =
                sessionMap.get(slot.sessionNumber) ||
                new Map<number, LocalSlot[]>()
            const list = courtMap.get(slot.courtNumber) || []
            list.push(slot)
            courtMap.set(slot.courtNumber, list)
            sessionMap.set(slot.sessionNumber, courtMap)
        }

        return [1, 2].map((sessionNumber) => ({
            sessionNumber,
            courtMap:
                sessionMap.get(sessionNumber) || new Map<number, LocalSlot[]>()
        }))
    }, [slotAssignments])

    const alternateCourtMap = useMemo(() => {
        const courtMap = new Map<number, LocalSlot[]>()
        for (const slot of slotAssignments) {
            if (slot.sessionNumber !== 3) continue
            const list = courtMap.get(slot.courtNumber) || []
            list.push(slot)
            courtMap.set(slot.courtNumber, list)
        }
        return courtMap
    }, [slotAssignments])

    const addSlot = (sessionNumber: number, courtNumber: number) => {
        const key = `new-${nextKey.current++}`
        setSlotAssignments((prev) => [
            ...prev,
            { localKey: key, sessionNumber, courtNumber, userId: "" }
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

        const filledSlots = slotAssignments.filter((slot) => slot.userId)
        const userIds = filledSlots.map((s) => s.userId)
        const uniqueIds = new Set(userIds)

        if (uniqueIds.size !== userIds.length) {
            setError("A player cannot be assigned to multiple slots.")
            return
        }

        setIsSaving(true)

        const result = await updateWeek1Rosters(
            filledSlots.map((slot) => ({
                sessionNumber: slot.sessionNumber,
                courtNumber: slot.courtNumber,
                userId: slot.userId
            }))
        )

        if (result.status) {
            setSuccess(result.message)
            const changes = computeWeek1Diff(
                lastSavedSlots.current.filter((s) => s.userId),
                filledSlots,
                players
            )
            lastSavedSlots.current = filledSlots
            if (changes.length > 0) {
                setPendingChanges(changes)
                setNotifyDialogOpen(true)
            }
        } else {
            setError(result.message)
        }

        setIsSaving(false)
    }

    const handleSendNotifications = async (selectedUserIds: string[]) => {
        setIsSendingNotifications(true)
        const toNotify = pendingChanges.filter((c) =>
            selectedUserIds.includes(c.userId)
        )
        const assignments = toNotify
            .filter((c) => c.changeKind !== "removed" && c.week1Assignment)
            .map((c) => ({
                userId: c.userId,
                sessionNumber: c.week1Assignment!.sessionNumber,
                courtNumber: c.week1Assignment!.courtNumber
            }))
        const removedIds = toNotify
            .filter((c) => c.changeKind === "removed")
            .map((c) => c.userId)
        await sendWeek1RosterNotifications(assignments, removedIds, seasonLabel)
        setIsSendingNotifications(false)
        setNotifyDialogOpen(false)
    }

    return (
        <div className="space-y-6">
            {groupedSlots.map(({ sessionNumber, courtMap }) => (
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
                                        <div className="space-y-2">
                                            {courtSlots.map((slot, idx) => (
                                                <div
                                                    key={slot.localKey}
                                                    className="flex items-end gap-1"
                                                >
                                                    <div className="min-w-0 flex-1 space-y-1">
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
                                                                    slot.localKey,
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
                                                    sessionNumber,
                                                    courtNumber
                                                )
                                            }
                                        >
                                            <RiAddLine className="mr-1 h-4 w-4" />
                                            Add Player
                                        </Button>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            ))}

            <Card>
                <CardHeader>
                    <CardTitle>Alternates</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {[1, 2, 3, 4].map((courtNumber) => {
                            const courtSlots =
                                alternateCourtMap.get(courtNumber) || []

                            return (
                                <div
                                    key={`alternates-court-${courtNumber}`}
                                    className="space-y-2 rounded-md border p-3"
                                >
                                    <h3 className="font-semibold text-sm">
                                        Court {courtNumber}
                                    </h3>
                                    <div className="space-y-2">
                                        {courtSlots.map((slot, idx) => (
                                            <div
                                                key={slot.localKey}
                                                className="flex items-end gap-1"
                                            >
                                                <div className="min-w-0 flex-1 space-y-1">
                                                    <p className="text-muted-foreground text-xs">
                                                        Slot {idx + 1}
                                                    </p>
                                                    <PlayerCombobox
                                                        players={players}
                                                        value={slot.userId}
                                                        onChange={(userId) =>
                                                            onChangeSlot(
                                                                slot.localKey,
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
                                        onClick={() => addSlot(3, courtNumber)}
                                    >
                                        <RiAddLine className="mr-1 h-4 w-4" />
                                        Add Player
                                    </Button>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>

            <UnassignedWeek1Players
                players={players}
                assignedUserIds={selectedUserIds}
                onPlayerClick={modal.openPlayerDetail}
            />

            <div className="flex flex-wrap items-center gap-3">
                <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSaving}
                >
                    {isSaving ? "Saving..." : "Save Week 1"}
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

            <RosterNotificationDialog
                open={notifyDialogOpen}
                weekNumber={1}
                seasonLabel={seasonLabel}
                changes={pendingChanges}
                isSending={isSendingNotifications}
                onConfirm={handleSendNotifications}
                onClose={() => setNotifyDialogOpen(false)}
            />
        </div>
    )
}
