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
import { friendships, signups, users } from "@/database/schema"
import { eq, and, or, desc, inArray } from "drizzle-orm"
import { formatDisplayName } from "@/lib/utils"
import {
    getNextMatchForUser,
    getLastMatchResultForUser,
    type NextMatch,
    type LastMatchResult
} from "@/lib/next-match"
import {
    getPreseasonAssignmentsForUsers,
    type PreseasonAssignment
} from "@/lib/preseason-assignment"

export interface FriendProfile {
    userId: string
    /** "Preferred Last" — the Friends page reads as a people list, not a roster. */
    name: string
    /** Kept separate so lists can sort by surname. */
    lastName: string
    picture: string | null
    pronouns: string | null
}

export interface FriendEntry extends FriendProfile {
    friendshipId: number
}

/** Season-schedule context shared by the page rows and the dashboard card. */
export interface FriendScheduleContext {
    nextMatch: NextMatch | null
    preseason: PreseasonAssignment | null
    /** Has a signups row for the season, whether or not they're scheduled. */
    signedUpForSeason: boolean
}

export interface FriendListEntry extends FriendEntry, FriendScheduleContext {
    lastResult: LastMatchResult | null
}

export interface FriendNextMatchEntry
    extends FriendEntry,
        FriendScheduleContext {}

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
        name: formatDisplayName(row.firstName, row.lastName, row.preferredName),
        lastName: row.lastName,
        picture: row.picture,
        pronouns: row.pronouns
    }
}

function compareByLastName(a: FriendProfile, b: FriendProfile): number {
    return a.lastName.localeCompare(b.lastName) || a.name.localeCompare(b.name)
}

/**
 * Playing soonest first — a match if there is one, otherwise a tryout slot —
 * then everyone with nothing scheduled. Surname breaks ties in both groups.
 */
function sortBySchedule<T extends FriendProfile & FriendScheduleContext>(
    entries: T[]
): T[] {
    const keyOf = (entry: T) =>
        entry.nextMatch?.sortKey ?? entry.preseason?.sortKey ?? null
    return entries.sort((a, b) => {
        const aKey = keyOf(a)
        const bKey = keyOf(b)
        if (aKey && bKey) {
            return aKey.localeCompare(bKey) || compareByLastName(a, b)
        }
        if (aKey) return -1
        if (bKey) return 1
        return compareByLastName(a, b)
    })
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
 * Season context for a set of users, batched: who is signed up and who holds
 * a preseason tryout slot. Both are needed to tell "no assignment yet" apart
 * from "not in this season".
 */
async function loadSeasonContext(
    userIds: string[],
    seasonId: number
): Promise<{
    signedUp: Set<string>
    preseason: Map<string, PreseasonAssignment>
}> {
    if (userIds.length === 0) {
        return { signedUp: new Set(), preseason: new Map() }
    }
    const [signupRows, preseason] = await Promise.all([
        db
            .select({ player: signups.player })
            .from(signups)
            .where(
                and(
                    eq(signups.season, seasonId),
                    inArray(signups.player, userIds)
                )
            ),
        getPreseasonAssignmentsForUsers(userIds, seasonId)
    ])
    return {
        signedUp: new Set(signupRows.map((row) => row.player)),
        preseason
    }
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
    if (seasonId === null) {
        return sortBySchedule(
            friends.map((friend) => ({
                ...friend,
                nextMatch: null,
                preseason: null,
                signedUpForSeason: false,
                lastResult: null
            }))
        )
    }

    const context = await loadSeasonContext(
        friends.map((f) => f.userId),
        seasonId
    )
    const entries = await Promise.all(
        friends.map(async (friend) => {
            const [nextMatch, lastResult] = await Promise.all([
                getNextMatchForUser(friend.userId, seasonId),
                getLastMatchResultForUser(friend.userId, seasonId)
            ])
            return {
                ...friend,
                nextMatch,
                preseason: context.preseason.get(friend.userId) ?? null,
                signedUpForSeason: context.signedUp.has(friend.userId),
                lastResult
            }
        })
    )
    return sortBySchedule(entries)
}

/** Lighter variant for the dashboard card: no last-result lookup. */
export async function getFriendsWithNextMatch(
    userId: string,
    seasonId: number | null
): Promise<FriendNextMatchEntry[]> {
    const friends = await listFriends(userId)
    if (seasonId === null) {
        return sortBySchedule(
            friends.map((friend) => ({
                ...friend,
                nextMatch: null,
                preseason: null,
                signedUpForSeason: false
            }))
        )
    }

    const context = await loadSeasonContext(
        friends.map((f) => f.userId),
        seasonId
    )
    const entries = await Promise.all(
        friends.map(async (friend) => ({
            ...friend,
            nextMatch: await getNextMatchForUser(friend.userId, seasonId),
            preseason: context.preseason.get(friend.userId) ?? null,
            signedUpForSeason: context.signedUp.has(friend.userId)
        }))
    )
    return sortBySchedule(entries)
}
