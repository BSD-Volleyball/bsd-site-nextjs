"use client"

import { useMemo, type DragEvent } from "react"
import {
    RiDeleteBin2Line,
    RiDraggable,
    RiUserUnfollowLine
} from "@remixicon/react"
import { cn } from "@/lib/utils"
import { PlayerCombobox } from "./player-combobox"
import { PlayerPic } from "./player-pic"
import type { DraftHomeworkPlayer } from "./actions"
import type { Selections } from "./homework-selections"

interface RoundGroupProps {
    label: string
    round: number
    numTeams: number
    tabKey: "m" | "f"
    players: DraftHomeworkPlayer[]
    selections: Selections
    excludeIds: string[]
    draftedIds: string[]
    playerPicUrl: string
    onChange: (key: string, userId: string | null) => void
    onOpenPlayer: (userId: string) => void
    /** Remove the entry at this key; everything ranked below it moves up. */
    onRemoveKey: (key: string) => void
    /** Move the entry at `fromKey` to `toKey`; slots in between shift by one. */
    onMove: (fromKey: string, toKey: string) => void
    draggingKey: string | null
    dragOverKey: string | null
    onDraggingKeyChange: (key: string | null) => void
    onDragOverKeyChange: (key: string | null) => void
    /** Considering section: growable list instead of one slot per team. */
    isDynamic?: boolean
    slotCount?: number
    onAddSlot?: () => void
}

export function RoundGroup({
    label,
    round,
    numTeams,
    tabKey,
    players,
    selections,
    excludeIds,
    draftedIds,
    playerPicUrl,
    onChange,
    onOpenPlayer,
    onRemoveKey,
    onMove,
    draggingKey,
    dragOverKey,
    onDraggingKeyChange,
    onDragOverKeyChange,
    isDynamic = false,
    slotCount = numTeams,
    onAddSlot
}: RoundGroupProps) {
    const slots = Array.from({ length: slotCount }, (_, i) => i)
    const draftedSet = useMemo(() => new Set(draftedIds), [draftedIds])

    const selectedPlayers = slots
        .map((slot) => {
            const key = `${tabKey}-${round}-${slot}`
            const userId = selections[key] ?? null
            return userId
                ? (players.find((p) => p.userId === userId) ?? null)
                : null
        })
        .filter((p): p is DraftHomeworkPlayer => p !== null)

    // Each combobox is h-8 = 32px, gap-1 = 4px
    const totalHeightPx = slotCount * 32 + (slotCount - 1) * 4
    // Reference height matches a full round (numTeams slots) — used for consistent photo sizing in the dynamic section
    const referenceHeightPx = numTeams * 32 + (numTeams - 1) * 4

    // Chunk selected players into rows of numTeams for the dynamic (Considering) section
    const photoRows: DraftHomeworkPlayer[][] = []
    if (isDynamic) {
        for (let i = 0; i < selectedPlayers.length; i += numTeams) {
            photoRows.push(selectedPlayers.slice(i, i + numTeams))
        }
    }

    const handleDragStart = (e: DragEvent<HTMLElement>, key: string) => {
        onDraggingKeyChange(key)
        e.dataTransfer.effectAllowed = "move"
        // Use the whole slot row as the drag image, not just the handle.
        const row = e.currentTarget.parentElement
        if (row) {
            const el = row.cloneNode(true) as HTMLElement
            el.style.width = `${row.offsetWidth}px`
            el.style.position = "fixed"
            el.style.top = "-1000px"
            document.body.appendChild(el)
            e.dataTransfer.setDragImage(el, 12, 16)
            setTimeout(() => document.body.removeChild(el), 0)
        }
    }

    const handleDragEnd = () => {
        onDraggingKeyChange(null)
        onDragOverKeyChange(null)
    }

    const handleDrop = (e: DragEvent<HTMLDivElement>, key: string) => {
        e.preventDefault()
        if (draggingKey && draggingKey !== key) {
            onMove(draggingKey, key)
        }
        handleDragEnd()
    }

    return (
        <div className="mb-4">
            <p className="mb-1 font-medium text-sm">{label}</p>
            <div className="overflow-x-auto">
                <div
                    className="flex items-start gap-3"
                    style={{ minWidth: "max-content" }}
                >
                    {/* Player selectors */}
                    <div
                        role="list"
                        className="flex min-w-48 flex-col gap-1 rounded-md border bg-muted/30"
                        style={{ width: "236px" }}
                    >
                        {slots.map((slot) => {
                            const key = `${tabKey}-${round}-${slot}`
                            const uid = selections[key] ?? null
                            const isInvalid = !!uid && draftedSet.has(uid)
                            const isDragging = draggingKey === key
                            const isDropTarget =
                                !!draggingKey &&
                                dragOverKey === key &&
                                !isDragging
                            return (
                                <div
                                    key={key}
                                    role="listitem"
                                    className={cn(
                                        "flex items-center rounded-sm",
                                        isDragging &&
                                            "border border-primary/60 border-dashed bg-primary/10",
                                        isDropTarget &&
                                            "ring-2 ring-primary/60 ring-inset"
                                    )}
                                    onDragOver={(e) => {
                                        if (!draggingKey) return
                                        e.preventDefault()
                                        e.dataTransfer.dropEffect = "move"
                                        if (dragOverKey !== key) {
                                            onDragOverKeyChange(key)
                                        }
                                    }}
                                    onDragLeave={() => {
                                        if (dragOverKey === key) {
                                            onDragOverKeyChange(null)
                                        }
                                    }}
                                    onDrop={(e) => handleDrop(e, key)}
                                >
                                    {uid ? (
                                        <button
                                            type="button"
                                            draggable
                                            onDragStart={(e) =>
                                                handleDragStart(e, key)
                                            }
                                            onDragEnd={handleDragEnd}
                                            className="shrink-0 cursor-grab px-0.5 text-muted-foreground active:cursor-grabbing"
                                            title="Drag to reorder"
                                            aria-label="Drag to reorder"
                                        >
                                            <RiDraggable className="h-4 w-4" />
                                        </button>
                                    ) : (
                                        <span className="w-5 shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <PlayerCombobox
                                            players={players}
                                            value={uid}
                                            onChange={(userId) =>
                                                onChange(key, userId)
                                            }
                                            excludeIds={excludeIds}
                                            draftedIds={draftedIds}
                                            isInvalid={isInvalid}
                                        />
                                    </div>
                                    {isInvalid && (
                                        <button
                                            type="button"
                                            onClick={() => onRemoveKey(key)}
                                            className="shrink-0 p-1 text-red-700 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200"
                                            title="Remove drafted player & shift everyone below up"
                                        >
                                            <RiUserUnfollowLine className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                    {isDynamic && !isInvalid && (
                                        <button
                                            type="button"
                                            onClick={() => onRemoveKey(key)}
                                            className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                                            title="Remove"
                                        >
                                            <RiDeleteBin2Line className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                        {isDynamic && onAddSlot && (
                            <button
                                type="button"
                                onClick={onAddSlot}
                                className="px-2 py-1 text-left text-muted-foreground text-sm hover:text-foreground"
                            >
                                + Add player
                            </button>
                        )}
                    </div>

                    {/* Player pictures */}
                    {isDynamic ? (
                        <div className="flex flex-col gap-2">
                            {photoRows.map((row, rowIdx) => (
                                <div
                                    key={rowIdx}
                                    className="flex items-stretch gap-1"
                                    style={{ height: `${referenceHeightPx}px` }}
                                >
                                    {row.map((player) => (
                                        <PlayerPic
                                            key={player.userId}
                                            player={player}
                                            playerPicUrl={playerPicUrl}
                                            height="100%"
                                            onOpen={onOpenPlayer}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div
                            className="flex items-stretch gap-1"
                            style={{ height: `${totalHeightPx}px` }}
                        >
                            {selectedPlayers.map((player) => (
                                <PlayerPic
                                    key={player.userId}
                                    player={player}
                                    playerPicUrl={playerPicUrl}
                                    height="100%"
                                    onOpen={onOpenPlayer}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
