"use client"

import type { ReactNode } from "react"
import { RoomProvider } from "@/lib/liveblocks.config"
import { ClientSideSuspense } from "@liveblocks/react"

interface DraftRoomProviderProps {
    seasonId: number
    divisionId: number
    children: ReactNode
}

export function DraftRoomProvider({
    seasonId,
    divisionId,
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
                picks: {}
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
