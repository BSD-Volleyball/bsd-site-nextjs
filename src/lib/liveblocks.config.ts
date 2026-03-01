import { createClient } from "@liveblocks/client"
import { createRoomContext } from "@liveblocks/react"

const client = createClient({
    authEndpoint: "/api/liveblocks-auth"
})

type Presence = {
    userId: string
    name: string
    role: "commissioner" | "captain"
}

// picks key format: "round-teamId" -> userId or null
type Storage = {
    picks: { [key: string]: string | null }
}

type UserMeta = {
    id: string
    info: {
        name: string
        role: "commissioner" | "captain"
        captainTeamIds: number[]
    }
}

type RoomEvent = {
    type: "DRAFT_SUBMITTED"
    submittedBy: string
}

export const {
    RoomProvider,
    useStorage,
    useMutation,
    useOthers,
    useSelf,
    useRoom,
    useBroadcastEvent,
    useEventListener
} = createRoomContext<Presence, Storage, UserMeta, RoomEvent>(client)
