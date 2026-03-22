"use client"

import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { RiAddLine } from "@remixicon/react"
import type { PlayerListItem } from "./actions"
import { usePlayerSlots } from "./use-player-slots"
import { PlayerSlotColumn } from "./player-slot-column"

interface PlayerLookupFormProps {
    players: PlayerListItem[]
    playerPicUrl: string
}

export function PlayerLookupForm({
    players,
    playerPicUrl
}: PlayerLookupFormProps) {
    const { slots, dispatch } = usePlayerSlots()

    const hasAnySelection = slots.some((s) => s.selectedPlayerId !== null)

    const excludedIdsBySlot = useMemo(() => {
        const allSelected = new Set(
            slots
                .map((s) => s.selectedPlayerId)
                .filter((id): id is string => id !== null)
        )
        return slots.map((slot) => {
            const excluded = new Set(allSelected)
            if (slot.selectedPlayerId) {
                excluded.delete(slot.selectedPlayerId)
            }
            return excluded
        })
    }, [slots])

    return (
        <div className="flex gap-6 overflow-x-auto pb-4">
            {slots.map((slot, index) => (
                <PlayerSlotColumn
                    key={slot.id}
                    slot={slot}
                    players={players}
                    playerPicUrl={playerPicUrl}
                    dispatch={dispatch}
                    showRemoveButton={slots.length > 1}
                    excludedPlayerIds={excludedIdsBySlot[index]}
                />
            ))}

            {hasAnySelection && (
                <div className="flex shrink-0 items-start pt-0.5">
                    <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => dispatch({ type: "ADD_SLOT" })}
                    >
                        <RiAddLine className="h-4 w-4" />
                        Add Player to Compare
                    </Button>
                </div>
            )}
        </div>
    )
}
