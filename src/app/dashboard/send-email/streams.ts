import {
    STREAM_BROADCAST,
    STREAM_IN_SEASON_UPDATES
} from "@/lib/postmark"

export const BROADCAST_STREAMS = [
    {
        id: STREAM_BROADCAST,
        name: "League Broadcast",
        description: "Sent to all users (broadcast stream)"
    },
    {
        id: STREAM_IN_SEASON_UPDATES,
        name: "In-Season Updates",
        description:
            "Sent to signed-up users, divisions, or teams (in-season stream)"
    }
] as const

export type BroadcastStreamId =
    (typeof BROADCAST_STREAMS)[number]["id"]
