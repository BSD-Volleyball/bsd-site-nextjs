"use client"

import { useMemo, type Dispatch } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import {
    getPlayerDetailsForSignups,
    type PlayerListItem,
    type SeasonInfo
} from "./actions"
import { PlayerDetailPopup } from "@/components/player-detail"
import type { PlayerSlot, SlotAction } from "./use-player-slots"

export function getDisplayName(player: PlayerListItem): string {
    const oldIdPart = player.old_id ? `[${player.old_id}] ` : ""
    const preferredPart = player.preferred_name
        ? ` (${player.preferred_name})`
        : ""
    return `${oldIdPart}${player.first_name}${preferredPart} ${player.last_name}`
}

interface PlayerSlotColumnProps {
    slot: PlayerSlot
    players: PlayerListItem[]
    allSeasons: SeasonInfo[]
    playerPicUrl: string
    dispatch: Dispatch<SlotAction>
    showRemoveButton: boolean
    excludedPlayerIds: Set<string>
}

export function PlayerSlotColumn({
    slot,
    players,
    allSeasons,
    playerPicUrl,
    dispatch,
    showRemoveButton,
    excludedPlayerIds
}: PlayerSlotColumnProps) {
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

        const result = await getPlayerDetailsForSignups(playerId)

        if (result.status && result.player) {
            dispatch({
                type: "LOAD_SUCCESS",
                slotId: slot.id,
                playerDetails: result.player,
                draftHistory: result.draftHistory,
                ratingAverages: result.ratingAverages,
                sharedRatingNotes: result.sharedRatingNotes,
                privateRatingNotes: result.privateRatingNotes,
                viewerRating: result.viewerRating,
                pairPickName: result.pairPickName,
                pairReason: result.pairReason,
                datesMissing: result.datesMissing,
                playoffDates: result.playoffDates
            })
        } else {
            dispatch({
                type: "LOAD_ERROR",
                slotId: slot.id,
                error: result.message || "Failed to load player details"
            })
        }
    }

    const handleClear = () => {
        dispatch({ type: "CLEAR_PLAYER", slotId: slot.id })
    }

    return (
        <div className="min-w-[36rem] shrink-0 space-y-4">
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
                                    ? getDisplayName(selectedPlayer)
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
                                        {getDisplayName(player)}
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

            <PlayerDetailPopup
                open={!!slot.selectedPlayerId}
                playerDetails={slot.playerDetails}
                draftHistory={slot.draftHistory}
                allSeasons={allSeasons}
                playerPicUrl={playerPicUrl}
                isLoading={slot.isLoading}
                pairPickName={slot.pairPickName}
                pairReason={slot.pairReason}
                datesMissing={slot.datesMissing}
                playoffDates={slot.playoffDates}
                ratingAverages={slot.ratingAverages}
                sharedRatingNotes={slot.sharedRatingNotes}
                privateRatingNotes={slot.privateRatingNotes}
                viewerRating={slot.viewerRating}
                inline
            />
        </div>
    )
}
