"use client"

import { PlayerPic } from "./player-pic"
import type { DraftHomeworkPlayer } from "./actions"
import { formatDisplayName } from "@/lib/utils"

interface SuggestedPlayerListProps {
    players: DraftHomeworkPlayer[]
    selectedIds: Set<string>
    playerPicUrl: string
    onOpenPlayer: (userId: string) => void
    onQuickAdd: (userId: string) => void
}

export function SuggestedPlayerList({
    players,
    selectedIds,
    playerPicUrl,
    onOpenPlayer,
    onQuickAdd
}: SuggestedPlayerListProps) {
    const visible = players.filter((p) => !selectedIds.has(p.userId))

    if (visible.length === 0) {
        return (
            <p className="text-muted-foreground text-sm">
                All suggested players have been selected.
            </p>
        )
    }

    return (
        <div className="flex flex-wrap gap-3">
            {visible.map((player) => {
                const displayName = formatDisplayName(
                    player.firstName,
                    player.lastName,
                    player.preferredName
                )
                return (
                    <div
                        key={player.userId}
                        className="flex flex-col items-center gap-1 text-center"
                    >
                        <PlayerPic
                            player={player}
                            playerPicUrl={playerPicUrl}
                            height="5rem"
                            onOpen={onOpenPlayer}
                        />
                        <div className="flex items-center gap-0.5">
                            <span className="max-w-16 text-muted-foreground text-sm leading-tight">
                                {displayName}
                            </span>
                            <button
                                type="button"
                                onClick={() => onQuickAdd(player.userId)}
                                title={`Add ${displayName} to next open slot`}
                                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-xs leading-none hover:bg-primary/20"
                            >
                                +
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
