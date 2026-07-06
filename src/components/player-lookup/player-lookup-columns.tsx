"use client"

import { useMemo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { RiAddLine } from "@remixicon/react"
import { usePlayerSlots, type PlayerSlot } from "./use-player-slots"
import type { LookupPlayerItem } from "./use-player-slots"
import { PlayerSlotColumn, type LoadDetailResult } from "./player-slot-column"

interface PlayerLookupColumnsProps<TDetail> {
    players: LookupPlayerItem[]
    loadDetails: (playerId: string) => Promise<LoadDetailResult<TDetail>>
    renderDetail: (slot: PlayerSlot<TDetail>) => ReactNode
    widthClassName: string
}

/**
 * Side-by-side player comparison columns: each column is a searchable player
 * picker plus a detail panel supplied by the caller (admin or player-facing).
 */
export function PlayerLookupColumns<TDetail>({
    players,
    loadDetails,
    renderDetail,
    widthClassName
}: PlayerLookupColumnsProps<TDetail>) {
    const { slots, dispatch } = usePlayerSlots<TDetail>()

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
                    dispatch={dispatch}
                    showRemoveButton={slots.length > 1}
                    excludedPlayerIds={excludedIdsBySlot[index]}
                    loadDetails={loadDetails}
                    renderDetail={renderDetail}
                    widthClassName={widthClassName}
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
