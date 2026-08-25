import "server-only"

import { getSeasonConfig } from "@/lib/site-config"
import { listUserNames } from "@/lib/user-directory"
import { playerPicBaseUrl } from "@/config/env"
import {
    getFriendsWithSchedule,
    listIncomingRequests,
    listOutgoingRequests,
    type FriendListEntry,
    type PendingRequestEntry
} from "@/lib/friends"

export interface FriendsPageData {
    friends: FriendListEntry[]
    incoming: PendingRequestEntry[]
    outgoing: PendingRequestEntry[]
    /**
     * Members addable as friends: everyone except self, current friends and
     * outgoing requests. Players with a pending request TO us stay in the
     * list — picking them auto-accepts via sendFriendRequest.
     */
    members: { id: string; name: string }[]
    playerPicUrl: string
}

export async function getFriendsPageData(
    userId: string
): Promise<FriendsPageData> {
    const seasonConfig = await getSeasonConfig()
    const seasonId = seasonConfig.seasonId || null

    const [friends, incoming, outgoing, allMembers] = await Promise.all([
        getFriendsWithSchedule(userId, seasonId),
        listIncomingRequests(userId),
        listOutgoingRequests(userId),
        listUserNames()
    ])

    const excluded = new Set<string>([
        userId,
        ...friends.map((f) => f.userId),
        ...outgoing.map((r) => r.userId)
    ])

    return {
        friends,
        incoming,
        outgoing,
        members: allMembers.filter((m) => !excluded.has(m.id)),
        playerPicUrl: playerPicBaseUrl()
    }
}
