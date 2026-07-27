"use client"

import { useState, useMemo } from "react"
import { RoundGroup } from "./round-group"
import { SuggestedPlayerList } from "./suggested-player-list"
import { CONSIDERING_ROUND, type Selections } from "./homework-selections"
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

    return (
        <div className="pt-4">
            {rounds.map((round) => (
                <RoundGroup
                    key={round}
                    label={`Round ${round}`}
                    round={round}
                    numTeams={numTeams}
                    tabKey={tabKey}
                    players={players}
                    selections={selections}
                    excludeIds={allSelectedIds}
                    draftedIds={draftedIds}
                    playerPicUrl={playerPicUrl}
                    onChange={onChange}
                    onOpenPlayer={onOpenPlayer}
                />
            ))}
            <RoundGroup
                label="Considering"
                round={CONSIDERING_ROUND}
                numTeams={numTeams}
                tabKey={tabKey}
                players={players}
                selections={selections}
                excludeIds={allSelectedIds}
                draftedIds={draftedIds}
                playerPicUrl={playerPicUrl}
                onChange={onChange}
                onOpenPlayer={onOpenPlayer}
                isDynamic
                controlledDynamicCount={consideringCount}
                onControlledDynamicCountChange={setConsideringCount}
            />

            {suggestedPlayers.length > 0 && (
                <div className="mt-6 rounded-md border bg-muted/20 p-4">
                    <p className="mb-1 font-semibold text-sm">
                        Players To Consider
                    </p>
                    <p className="mb-3 text-muted-foreground text-xs">
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
