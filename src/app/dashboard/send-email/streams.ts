export const BROADCAST_STREAMS = [
    {
        id: "broadcast" as const,
        name: "League Broadcast",
        description: "Sent to all users (broadcast stream)"
    },
    {
        id: "in-season-updates" as const,
        name: "In-Season Updates",
        description:
            "Sent to signed-up users, divisions, or teams (in-season stream)"
    }
] as const

export type BroadcastStreamId = (typeof BROADCAST_STREAMS)[number]["id"]
