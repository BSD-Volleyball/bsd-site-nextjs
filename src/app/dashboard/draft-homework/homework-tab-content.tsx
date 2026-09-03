"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { formatPlayerName } from "@/lib/utils"
import { RoundGroup } from "./round-group"
import { SuggestedPlayerList } from "./suggested-player-list"
import { CONSIDERING_ROUND, type Selections } from "./homework-selections"
import {
    moveEntry,
    removeAndShiftUp,
    removeKeyAndShiftUp,
    type TabShape
} from "./homework-board"
import type { DraftHomeworkPlayer } from "./actions"

interface TabContentProps {
    tabKey: "m" | "f"
    numRounds: number
    numTeams: number
    players: DraftHomeworkPlayer[]
    suggestedPlayers: DraftHomeworkPlayer[]
    selections: Selections
    draftedIds: string[]
    playerPicUrl: string
    onChange: (key: string, userId: string | null) => void
    /** Merge many slot changes at once (shift-up and drag-and-drop). */
    onBulkChange: (patch: Selections) => void
    onOpenPlayer: (userId: string) => void
}

export function HomeworkTabContent({
    tabKey,
    numRounds,
    numTeams,
    players,
    suggestedPlayers,
    selections,
    draftedIds,
    playerPicUrl,
    onChange,
    onBulkChange,
    onOpenPlayer
}: TabContentProps) {
    const allSelectedIds = useMemo(() => {
        const ids: string[] = []
        for (const [key, userId] of Object.entries(selections)) {
            if (key.startsWith(`${tabKey}-`) && userId) {
                ids.push(userId)
            }
        }
        return ids
    }, [selections, tabKey])

    const selectedIdSet = useMemo(
        () => new Set(allSelectedIds),
        [allSelectedIds]
    )

    const [consideringCount, setConsideringCount] = useState(() => {
        const existing = Object.keys(selections).filter((k) =>
            k.startsWith(`${tabKey}-${CONSIDERING_ROUND}-`)
        ).length
        return Math.max(1, existing)
    })

    const shape: TabShape = { tabKey, numRounds, numTeams, consideringCount }

    const [draggingKey, setDraggingKey] = useState<string | null>(null)
    const [dragOverKey, setDragOverKey] = useState<string | null>(null)

    const draftedSet = useMemo(() => new Set(draftedIds), [draftedIds])
    const draftedOnBoard = useMemo(
        () =>
            players.filter(
                (p) => selectedIdSet.has(p.userId) && draftedSet.has(p.userId)
            ),
        [players, selectedIdSet, draftedSet]
    )

    const applyShift = (result: {
        selections: Selections
        consideringCount: number
    }) => {
        onBulkChange(result.selections)
        setConsideringCount(result.consideringCount)
    }

    const handleRemoveDrafted = () => {
        applyShift(removeAndShiftUp(selections, shape, draftedSet))
    }

    const handleRemoveKey = (key: string) => {
        applyShift(removeKeyAndShiftUp(selections, shape, key))
    }

    const handleMove = (fromKey: string, toKey: string) => {
        onBulkChange(moveEntry(selections, shape, fromKey, toKey))
    }

    const handleQuickAdd = (userId: string) => {
        // Try regular rounds first (round 1..numRounds, slots 0..numTeams-1)
        for (let round = 1; round <= numRounds; round++) {
            for (let slot = 0; slot < numTeams; slot++) {
                const key = `${tabKey}-${round}-${slot}`
                if (!selections[key]) {
                    onChange(key, userId)
                    return
                }
            }
        }
        // Fall back to Considering — find first empty slot or append
        for (let slot = 0; slot < consideringCount; slot++) {
            const key = `${tabKey}-${CONSIDERING_ROUND}-${slot}`
            if (!selections[key]) {
                onChange(key, userId)
                return
            }
        }
        // All considering slots filled, append a new one
        const newSlot = consideringCount
        setConsideringCount((c) => c + 1)
        onChange(`${tabKey}-${CONSIDERING_ROUND}-${newSlot}`, userId)
    }

    const rounds = Array.from({ length: numRounds }, (_, i) => i + 1)

    const roundGroupProps = {
        numTeams,
        tabKey,
        players,
        selections,
        excludeIds: allSelectedIds,
        draftedIds,
        playerPicUrl,
        onChange,
        onOpenPlayer,
        onRemoveKey: handleRemoveKey,
        onMove: handleMove,
        draggingKey,
        dragOverKey,
        onDraggingKeyChange: setDraggingKey,
        onDragOverKeyChange: setDragOverKey
    }

    return (
        <div className="pt-4">
            {draftedOnBoard.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-800 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    <div className="min-w-0 flex-1">
                        <p className="font-medium">
                            {draftedOnBoard.length === 1
                                ? "1 player on this board has been drafted: "
                                : `${draftedOnBoard.length} players on this board have been drafted: `}
                            {draftedOnBoard
                                .map((p) =>
                                    formatPlayerName(
                                        p.firstName,
                                        p.lastName,
                                        p.preferredName
                                    )
                                )
                                .join(", ")}
                        </p>
                        <p className="mt-0.5 text-red-700/80 dark:text-red-300/80">
                            Removing them moves everyone below up one slot; add
                            new players at the bottom.
                        </p>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleRemoveDrafted}
                        className="border-red-300 bg-white text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
                    >
                        Remove drafted &amp; shift up
                    </Button>
                </div>
            )}

            {rounds.map((round) => (
                <RoundGroup
                    key={round}
                    label={`Round ${round}`}
                    round={round}
                    {...roundGroupProps}
                />
            ))}
            <RoundGroup
                label="Considering"
                round={CONSIDERING_ROUND}
                {...roundGroupProps}
                isDynamic
                slotCount={consideringCount}
                onAddSlot={() => setConsideringCount((c) => c + 1)}
            />

            {suggestedPlayers.length > 0 && (
                <div className="mt-6 rounded-md border bg-muted/20 p-4">
                    <p className="mb-1 font-semibold text-sm">
                        Players To Consider
                    </p>
                    <p className="mb-3 text-muted-foreground text-sm">
                        You are free to select any registered player above. As
                        an aid here are players that based on historical data
                        and captain&apos;s ratings may end up in this division.
                        Players you&apos;ve already selected are hidden. Click a
                        photo to view their profile.
                    </p>
                    <SuggestedPlayerList
                        players={suggestedPlayers}
                        selectedIds={selectedIdSet}
                        playerPicUrl={playerPicUrl}
                        onOpenPlayer={onOpenPlayer}
                        onQuickAdd={handleQuickAdd}
                    />
                </div>
            )}
        </div>
    )
}
