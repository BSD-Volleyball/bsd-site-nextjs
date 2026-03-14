"use client"

import type { ReactNode } from "react"
import { RoomProvider } from "@/lib/liveblocks.config"
import { ClientSideSuspense } from "@liveblocks/react"

interface DraftRoomProviderProps {
    seasonId: number
    divisionId: number
    initialPicks: Record<string, string>
    children: ReactNode
}

export function DraftRoomProvider({
    seasonId,
    divisionId,
    initialPicks,
    children
}: DraftRoomProviderProps) {
    const roomId = `draft-s${seasonId}-d${divisionId}`

    return (
        <RoomProvider
            id={roomId}
            initialPresence={{
                userId: "",
                name: "",
                role: "captain"
            }}
            initialStorage={{
                picks: initialPicks
            }}
        >
            <ClientSideSuspense
                fallback={
                    <p className="text-muted-foreground text-sm">
                        Connecting to live draft...
                    </p>
                }
            >
                {children}
            </ClientSideSuspense>
        </RoomProvider>
    )
}
