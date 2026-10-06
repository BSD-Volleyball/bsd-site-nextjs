"use server"

import { db } from "@/database/db"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import { friendships, users } from "@/database/schema"
import { and, eq, gt, sql } from "drizzle-orm"
import {
    withAction,
    requireSession,
    requireNonEmptyString,
    requirePositiveInt,
    ok,
    fail,
    type ActionResult
} from "@/next/action-helpers"
import { areFriends, getLiveFriendshipEdge } from "@/lib/friends"
import {
    getPersonalAnalytics,
    getAllSeasons,
    type ChampionshipEntry,
    type SeasonInfo
} from "@/lib/player-elo-data"
import type { EloHistoryPoint } from "@/lib/player-elo"
import type { CareerStats } from "@/lib/player-career-stats"
import {
    getSeasonHistoryForUser,
    type SeasonHistoryEntry
} from "@/lib/player-season-history"
import { dispatchNotification } from "@/lib/notifications/dispatch"
import {
    buildFriendRequestHtml,
    buildFriendAcceptedHtml
} from "@/lib/email-html"
import { formatDisplayName } from "@/lib/utils"

interface FriendUserRow {
    id: string
    email: string
    firstName: string
    lastName: string
    preferredName: string | null
}

async function findUser(userId: string): Promise<FriendUserRow | null> {
    const [row] = await db
        .select({
            id: users.id,
            email: users.email,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    return row ?? null
}

async function notifyFriendRequest(
    requester: FriendUserRow,
    target: FriendUserRow
) {
    await dispatchNotification({
        type: "friend_request_received",
        recipients: [
            {
                userId: target.id,
                email: target.email,
                firstName: target.preferredName || target.firstName
            }
        ],
        subject: "You have a new friend request",
        htmlBody: (r) =>
            buildFriendRequestHtml({
                firstName: r.firstName ?? "there",
                requesterName: formatDisplayName(
                    requester.firstName,
                    requester.lastName,
                    requester.preferredName
                )
            })
    })
}

async function notifyFriendAccepted(
    accepter: FriendUserRow,
    requesterId: string
) {
    const requester = await findUser(requesterId)
    if (!requester) return
    await dispatchNotification({
        type: "friend_request_accepted",
        recipients: [
            {
                userId: requester.id,
                email: requester.email,
                firstName: requester.preferredName || requester.firstName
            }
        ],
        subject: "Your friend request was accepted",
        htmlBody: (r) =>
            buildFriendAcceptedHtml({
                firstName: r.firstName ?? "there",
                accepterName: formatDisplayName(
                    accepter.firstName,
                    accepter.lastName,
                    accepter.preferredName
                )
            })
    })
}

/**
 * Send a friend request. If the target already has a pending request TO the
 * caller, adding them back auto-accepts it instead of creating a duplicate.
 */
const FRIEND_REQUEST_WINDOW = "24 hours"
const FRIEND_REQUESTS_PER_WINDOW = 30
const FRIEND_REQUESTS_PER_PERSON_PER_WINDOW = 3

export const sendFriendRequest = withAction(
    async (
        targetUserId: string
    ): Promise<ActionResult<{ autoAccepted: boolean }>> => {
        const session = await requireSession()
        const targetId = requireNonEmptyString(targetUserId, "Player")
        const me = session.user.id

        if (targetId === me) {
            return fail("You can't friend yourself.")
        }

        const [self, target] = await Promise.all([
            findUser(me),
            findUser(targetId)
        ])
        if (!self || !target) {
            return fail("Player not found.")
        }

        const edge = await getLiveFriendshipEdge(me, targetId)
        if (edge?.status === "accepted") {
            return fail("You're already friends.")
        }
        if (edge?.status === "pending") {
            if (edge.requester === me) {
                return fail("Request already pending.")
            }
            // They already asked us — adding them back accepts the request.
            await db
                .update(friendships)
                .set({
                    status: "accepted",
                    responded_at: new Date(),
                    updated_at: new Date()
                })
                .where(
                    and(
                        eq(friendships.id, edge.id),
                        eq(friendships.status, "pending")
                    )
                )
            await notifyFriendAccepted(self, edge.requester)
            revalidateCalendarFeeds()
            return ok({ autoAccepted: true }, "You're now friends!")
        }

        // Each request emails the addressee from the league's account, and a
        // request can be cancelled and re-sent, so cap how often that can
        // happen. Cancelled rows are kept, so they still count.
        // Window computed by Postgres (created_at is a naive now() stamp).
        const recent = await db
            .select({ addressee: friendships.addressee })
            .from(friendships)
            .where(
                and(
                    eq(friendships.requester, me),
                    gt(
                        friendships.created_at,
                        sql`now() - ${FRIEND_REQUEST_WINDOW}::interval`
                    )
                )
            )
        if (
            recent.length >= FRIEND_REQUESTS_PER_WINDOW ||
            recent.filter((r) => r.addressee === targetId).length >=
                FRIEND_REQUESTS_PER_PERSON_PER_WINDOW
        ) {
            return fail(
                "You've sent a lot of friend requests today. Please try again tomorrow."
            )
        }

        try {
            await db.insert(friendships).values({
                requester: me,
                addressee: targetId
            })
        } catch {
            // Partial unique index: a racing request in either direction
            return fail("Request already pending.")
        }
        await notifyFriendRequest(self, target)
        revalidateCalendarFeeds()
        return ok({ autoAccepted: false }, "Friend request sent.")
    }
)

export const respondToFriendRequest = withAction(
    async (
        friendshipId: number,
        decision: "accept" | "decline"
    ): Promise<ActionResult<void>> => {
        const session = await requireSession()
        const id = requirePositiveInt(friendshipId, "request")
        if (decision !== "accept" && decision !== "decline") {
            return fail("Invalid decision.")
        }

        // Guarded update: only the addressee of a still-pending request may
        // respond, and concurrent responses can't double-fire.
        const updated = await db
            .update(friendships)
            .set({
                status: decision === "accept" ? "accepted" : "declined",
                responded_at: new Date(),
                updated_at: new Date()
            })
            .where(
                and(
                    eq(friendships.id, id),
                    eq(friendships.status, "pending"),
                    eq(friendships.addressee, session.user.id)
                )
            )
            .returning({ requester: friendships.requester })

        if (updated.length === 0) {
            return fail("Request not found.")
        }
        revalidateCalendarFeeds()

        if (decision === "accept") {
            const self = await findUser(session.user.id)
            if (self) {
                await notifyFriendAccepted(self, updated[0].requester)
            }
            return ok(undefined, "Friend request accepted.")
        }
        return ok(undefined, "Friend request declined.")
    }
)

export const cancelFriendRequest = withAction(
    async (friendshipId: number): Promise<ActionResult<void>> => {
        const session = await requireSession()
        const id = requirePositiveInt(friendshipId, "request")

        const updated = await db
            .update(friendships)
            .set({ status: "cancelled", updated_at: new Date() })
            .where(
                and(
                    eq(friendships.id, id),
                    eq(friendships.status, "pending"),
                    eq(friendships.requester, session.user.id)
                )
            )
            .returning({ id: friendships.id })

        if (updated.length === 0) {
            return fail("Request not found.")
        }
        revalidateCalendarFeeds()
        return ok(undefined, "Friend request cancelled.")
    }
)

/** Remove a friendship. Either party may remove; removal is mutual. */
export const removeFriend = withAction(
    async (friendUserId: string): Promise<ActionResult<void>> => {
        const session = await requireSession()
        const friendId = requireNonEmptyString(friendUserId, "Player")
        const me = session.user.id

        const edge = await getLiveFriendshipEdge(me, friendId)
        if (!edge || edge.status !== "accepted") {
            return fail("Friend not found.")
        }

        const updated = await db
            .update(friendships)
            .set({ status: "removed", updated_at: new Date() })
            .where(
                and(
                    eq(friendships.id, edge.id),
                    eq(friendships.status, "accepted")
                )
            )
            .returning({ id: friendships.id })

        if (updated.length === 0) {
            return fail("Friend not found.")
        }
        revalidateCalendarFeeds()
        return ok(undefined, "Friend removed.")
    }
)

export interface FriendAnalyticsResult {
    profile: {
        userId: string
        name: string
        pronouns: string | null
        picture: string | null
    }
    eloHistory: EloHistoryPoint[]
    currentRating: number | null
    careerStats: CareerStats
    championships: ChampionshipEntry[]
    allSeasons: SeasonInfo[]
    draftHistory: SeasonHistoryEntry[]
}

/**
 * Analytics for a confirmed friend (or yourself). Mirrors the commissioner
 * getPlayerAnalytics but gated on an accepted friendship instead of a role.
 */
export const getFriendAnalytics = withAction(
    async (friendId: string): Promise<ActionResult<FriendAnalyticsResult>> => {
        const session = await requireSession()
        const targetId = requireNonEmptyString(friendId, "Player")

        if (
            targetId !== session.user.id &&
            !(await areFriends(session.user.id, targetId))
        ) {
            return fail("You can only view analytics for your friends.")
        }

        const [profileRow] = await db
            .select({
                userId: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                pronouns: users.pronouns,
                picture: users.picture
            })
            .from(users)
            .where(eq(users.id, targetId))
            .limit(1)
        if (!profileRow) {
            return fail("Player not found.")
        }

        const [personal, allSeasons, draftHistory] = await Promise.all([
            getPersonalAnalytics(targetId),
            getAllSeasons(),
            getSeasonHistoryForUser(targetId)
        ])

        return ok({
            profile: {
                userId: profileRow.userId,
                name: formatDisplayName(
                    profileRow.firstName,
                    profileRow.lastName,
                    profileRow.preferredName
                ),
                pronouns: profileRow.pronouns,
                picture: profileRow.picture
            },
            eloHistory: personal.eloHistory,
            currentRating: personal.currentRating,
            careerStats: personal.careerStats,
            championships: personal.championships,
            allSeasons,
            draftHistory
        })
    }
)
