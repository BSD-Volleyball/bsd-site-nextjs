/**
 * friends.ts — friendship queries and page/dashboard assemblers.
 *
 * A friendship is a single `friendships` row: directional while pending
 * (requester must be approved by addressee), mutual once accepted. Terminal
 * statuses (declined/cancelled/removed) are history and never block a new
 * request. These helpers perform NO authorization: callers pass the session
 * user's id.
 */

import { db } from "@/database/db"
import { friendships, users } from "@/database/schema"
import { eq, and, or, desc } from "drizzle-orm"
import { formatPlayerName } from "@/lib/utils"
import {
    getNextMatchForUser,
    getLastMatchResultForUser,
    type NextMatch,
    type LastMatchResult
} from "@/lib/next-match"

export interface FriendProfile {
    userId: string
    name: string
    picture: string | null
    pronouns: string | null
}

export interface FriendEntry extends FriendProfile {
    friendshipId: number
}

export interface FriendListEntry extends FriendEntry {
    nextMatch: NextMatch | null
    lastResult: LastMatchResult | null
}

export interface FriendNextMatchEntry extends FriendEntry {
    nextMatch: NextMatch | null
}

export interface PendingRequestEntry extends FriendProfile {
    friendshipId: number
    createdAt: Date
}

const profileColumns = {
    userId: users.id,
    firstName: users.first_name,
    lastName: users.last_name,
    preferredName: users.preferred_name,
    picture: users.picture,
    pronouns: users.pronouns
}

type ProfileRow = {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    picture: string | null
    pronouns: string | null
}

function toProfile(row: ProfileRow): FriendProfile {
    return {
        userId: row.userId,
        name: formatPlayerName(row.firstName, row.lastName, row.preferredName),
        picture: row.picture,
        pronouns: row.pronouns
    }
}

/** Accepted friendships for a user (either direction), newest first. */
export async function listFriends(userId: string): Promise<FriendEntry[]> {
    const rows = await db
        .select({
            friendshipId: friendships.id,
            requester: friendships.requester,
            ...profileColumns
        })
        .from(friendships)
        .innerJoin(
            users,
            or(
                and(
                    eq(friendships.requester, userId),
                    eq(users.id, friendships.addressee)
                ),
                and(
                    eq(friendships.addressee, userId),
                    eq(users.id, friendships.requester)
                )
            )
        )
        .where(eq(friendships.status, "accepted"))
        .orderBy(desc(friendships.responded_at))

    return rows.map((row) => ({
        friendshipId: row.friendshipId,
        ...toProfile(row)
    }))
}

/** The live (pending or accepted) edge between two users, either direction. */
export async function getLiveFriendshipEdge(a: string, b: string) {
    const [row] = await db
        .select()
        .from(friendships)
        .where(
            and(
                or(
                    eq(friendships.status, "pending"),
                    eq(friendships.status, "accepted")
                ),
                or(
                    and(
                        eq(friendships.requester, a),
                        eq(friendships.addressee, b)
                    ),
                    and(
                        eq(friendships.requester, b),
                        eq(friendships.addressee, a)
                    )
                )
            )
        )
        .limit(1)
    return row ?? null
}

/** true iff an accepted friendship exists between the two users. */
export async function areFriends(a: string, b: string): Promise<boolean> {
    const edge = await getLiveFriendshipEdge(a, b)
    return edge?.status === "accepted"
}

/** Pending requests sent TO the user, newest first. */
export async function listIncomingRequests(
    userId: string
): Promise<PendingRequestEntry[]> {
    const rows = await db
        .select({
            friendshipId: friendships.id,
            createdAt: friendships.created_at,
            ...profileColumns
        })
        .from(friendships)
        .innerJoin(users, eq(users.id, friendships.requester))
        .where(
            and(
                eq(friendships.addressee, userId),
                eq(friendships.status, "pending")
            )
        )
        .orderBy(desc(friendships.created_at))

    return rows.map((row) => ({
        friendshipId: row.friendshipId,
        createdAt: row.createdAt,
        ...toProfile(row)
    }))
}

/** Pending requests sent BY the user, newest first. */
export async function listOutgoingRequests(
    userId: string
): Promise<PendingRequestEntry[]> {
    const rows = await db
        .select({
            friendshipId: friendships.id,
            createdAt: friendships.created_at,
            ...profileColumns
        })
        .from(friendships)
        .innerJoin(users, eq(users.id, friendships.addressee))
        .where(
            and(
                eq(friendships.requester, userId),
                eq(friendships.status, "pending")
            )
        )
        .orderBy(desc(friendships.created_at))

    return rows.map((row) => ({
        friendshipId: row.friendshipId,
        createdAt: row.createdAt,
        ...toProfile(row)
    }))
}

/**
 * Friends with their next match and last result for the season. Pass a null
 * seasonId (no season configured) to skip schedule lookups.
 */
export async function getFriendsWithSchedule(
    userId: string,
    seasonId: number | null
): Promise<FriendListEntry[]> {
    const friends = await listFriends(userId)
    return Promise.all(
        friends.map(async (friend) => {
            const [nextMatch, lastResult] =
                seasonId !== null
                    ? await Promise.all([
                          getNextMatchForUser(friend.userId, seasonId),
                          getLastMatchResultForUser(friend.userId, seasonId)
                      ])
                    : [null, null]
            return { ...friend, nextMatch, lastResult }
        })
    )
}

/** Lighter variant for the dashboard card: next match only. */
export async function getFriendsWithNextMatch(
    userId: string,
    seasonId: number | null
): Promise<FriendNextMatchEntry[]> {
    const friends = await listFriends(userId)
    return Promise.all(
        friends.map(async (friend) => ({
            ...friend,
            nextMatch:
                seasonId !== null
                    ? await getNextMatchForUser(friend.userId, seasonId)
                    : null
        }))
    )
}
