"use client"

import type { DraftHomeworkPlayer } from "./actions"

interface PlayerPicProps {
    player: DraftHomeworkPlayer
    playerPicUrl: string
    height: string
    onOpen: (userId: string) => void
}

export function PlayerPic({
    player,
    playerPicUrl,
    height,
    onOpen
}: PlayerPicProps) {
    const src = player.picture ? `${playerPicUrl}${player.picture}` : null
    const displayName = `${player.firstName} ${player.lastName}`
    return src ? (
        <button
            type="button"
            title={displayName}
            onClick={() => onOpen(player.userId)}
            className="shrink-0 cursor-pointer rounded transition-opacity hover:opacity-80"
            style={{ height }}
        >
            <img
                src={src}
                alt={displayName}
                className="h-full w-auto rounded object-cover"
            />
        </button>
    ) : (
        <button
            type="button"
            title={displayName}
            onClick={() => onOpen(player.userId)}
            className="flex shrink-0 cursor-pointer items-center justify-center rounded bg-muted text-muted-foreground text-sm transition-opacity hover:opacity-80"
            style={{ height, width: "2.5rem" }}
        >
            {player.firstName[0]}
            {player.lastName[0]}
        </button>
    )
}
