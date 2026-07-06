"use client"

import { useMemo, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import type {
    LookupPlayerItem,
    PlayerSlot,
    SlotDispatch
} from "./use-player-slots"

export function getLookupDisplayName(player: LookupPlayerItem): string {
    const oldIdPart = player.old_id ? `[${player.old_id}] ` : ""
    const preferredPart = player.preferred_name
        ? ` (${player.preferred_name})`
        : ""
    return `${oldIdPart}${player.first_name}${preferredPart} ${player.last_name}`
}

export type LoadDetailResult<TDetail> =
    | { ok: true; detail: TDetail }
    | { ok: false; error: string }

interface PlayerSlotColumnProps<TDetail> {
    slot: PlayerSlot<TDetail>
    players: LookupPlayerItem[]
    dispatch: SlotDispatch<TDetail>
    showRemoveButton: boolean
    excludedPlayerIds: Set<string>
    loadDetails: (playerId: string) => Promise<LoadDetailResult<TDetail>>
    renderDetail: (slot: PlayerSlot<TDetail>) => ReactNode
    widthClassName: string
}

export function PlayerSlotColumn<TDetail>({
    slot,
    players,
    dispatch,
    showRemoveButton,
    excludedPlayerIds,
    loadDetails,
    renderDetail,
    widthClassName
}: PlayerSlotColumnProps<TDetail>) {
    const selectedPlayer = useMemo(
        () => players.find((p) => p.id === slot.selectedPlayerId) ?? null,
        [players, slot.selectedPlayerId]
    )

    const filteredPlayers = useMemo(() => {
        const available = players.filter((p) => !excludedPlayerIds.has(p.id))
        if (!slot.search) return available
        const lowerSearch = slot.search.toLowerCase()
        return available.filter((p) => {
            const fullName = `${p.first_name} ${p.last_name}`.toLowerCase()
            const preferredName = (p.preferred_name || "").toLowerCase()
            const oldIdStr = p.old_id?.toString() || ""
            return (
                fullName.includes(lowerSearch) ||
                preferredName.includes(lowerSearch) ||
                oldIdStr.includes(lowerSearch)
            )
        })
    }, [players, slot.search, excludedPlayerIds])

    const handleSelect = async (playerId: string) => {
        dispatch({ type: "SELECT_PLAYER", slotId: slot.id, playerId })

        const result = await loadDetails(playerId)
        if (result.ok) {
            dispatch({
                type: "LOAD_SUCCESS",
                slotId: slot.id,
                detail: result.detail
            })
        } else {
            dispatch({
                type: "LOAD_ERROR",
                slotId: slot.id,
                error: result.error
            })
        }
    }

    const handleClear = () => {
        dispatch({ type: "CLEAR_PLAYER", slotId: slot.id })
    }

    return (
        <div className={cn("shrink-0 space-y-4", widthClassName)}>
            <div className="flex items-center gap-2">
                <Popover
                    open={slot.open}
                    onOpenChange={(open) =>
                        dispatch({ type: "SET_OPEN", slotId: slot.id, open })
                    }
                >
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={slot.open}
                            className="w-full justify-between font-normal"
                        >
                            <span
                                className={cn(
                                    !selectedPlayer && "text-muted-foreground"
                                )}
                            >
                                {selectedPlayer
                                    ? getLookupDisplayName(selectedPlayer)
                                    : "Search for a player..."}
                            </span>
                            <div className="flex items-center gap-1">
                                {selectedPlayer && (
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        className="rounded-sm p-0.5 hover:bg-accent"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleClear()
                                        }}
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === "Enter" ||
                                                e.key === " "
                                            ) {
                                                e.stopPropagation()
                                                handleClear()
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
                            placeholder="Search by name or old ID..."
                            value={slot.search}
                            onChange={(e) =>
                                dispatch({
                                    type: "SET_SEARCH",
                                    slotId: slot.id,
                                    search: e.target.value
                                })
                            }
                            autoCorrect="off"
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
                                            slot.selectedPlayerId ===
                                                player.id && "bg-accent"
                                        )}
                                        onClick={() => handleSelect(player.id)}
                                    >
                                        {getLookupDisplayName(player)}
                                    </button>
                                ))
                            )}
                        </div>
                    </PopoverContent>
                </Popover>

                {showRemoveButton && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() =>
                            dispatch({ type: "REMOVE_SLOT", slotId: slot.id })
                        }
                        aria-label="Remove player column"
                    >
                        <RiCloseLine className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {slot.error && (
                <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                    {slot.error}
                </div>
            )}

            {renderDetail(slot)}
        </div>
    )
}
