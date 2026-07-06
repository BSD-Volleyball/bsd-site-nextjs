"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { withAction, ok, fail } from "@/lib/action-helpers"
import { formatPlayerName } from "@/lib/utils"
import { db } from "@/database/db"
import { users, signups } from "@/database/schema"
import { eq, and, isNotNull, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"
import { getSessionUserId, isAdminOrDirectorBySession } from "@/lib/rbac"
import { revalidatePath } from "next/cache"

export interface PairUser {
    userId: string
    name: string
    email: string
    pairReason: string | null
}

export interface MatchedPair {
    userA: PairUser
    userB: PairUser
}

export interface UnmatchedPair {
    requester: PairUser
    requested: {
        userId: string
        name: string
        email: string
        hasDifferentPairRequest: boolean
    }
}

export async function getSeasonPairs(): Promise<{
    status: boolean
    message?: string
    matched: MatchedPair[]
    unmatched: UnmatchedPair[]
    seasonLabel: string
}> {
    const hasAccess = await isAdminOrDirectorBySession()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            matched: [],
            unmatched: [],
            seasonLabel: ""
        }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                matched: [],
                unmatched: [],
                seasonLabel: ""
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        // Fetch all signups that have a pair_pick
        const pairRows = await db
            .select({
                userId: signups.player,
                pairPickId: signups.pair_pick,
                pairReason: signups.pair_reason,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                email: users.email
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(
                and(
                    eq(signups.season, config.seasonId),
                    isNotNull(signups.pair_pick)
                )
            )

        // Build a map of userId -> their pair pick info
        const pairMap = new Map<
            string,
            {
                pairPickId: string
                pairReason: string | null
                name: string
                email: string
            }
        >()

        const allPairPickIds = new Set<string>()

        for (const row of pairRows) {
            const pickId = row.pairPickId!
            pairMap.set(row.userId, {
                pairPickId: pickId,
                pairReason: row.pairReason,
                email: row.email,
                name: formatPlayerName(
                    row.firstName,
                    row.lastName,
                    row.preferredName
                )
            })
            allPairPickIds.add(pickId)
        }

        // Fetch names for pair pick users who may not have signed up
        // (they won't be in pairMap if they didn't request a pair themselves)
        const missingUserIds = [...allPairPickIds].filter(
            (id) => !pairMap.has(id)
        )

        // Also need names for pair pick users who ARE in pairMap but
        // whose name we already have. For users NOT in pairMap at all,
        // we need a separate lookup.
        const pairPickNameMap = new Map<string, string>()
        const pairPickEmailMap = new Map<string, string>()

        // Names we already know from pairMap
        for (const [userId, data] of pairMap) {
            pairPickNameMap.set(userId, data.name)
            pairPickEmailMap.set(userId, data.email)
        }

        // Fetch names for users not in pairMap
        if (missingUserIds.length > 0) {
            const missingUsers = await db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preferred_name,
                    email: users.email
                })
                .from(users)
                .where(inArray(users.id, missingUserIds))

            for (const u of missingUsers) {
                pairPickNameMap.set(
                    u.id,
                    formatPlayerName(u.firstName, u.lastName, u.preferredName)
                )
                pairPickEmailMap.set(u.id, u.email)
            }
        }

        // Classify into matched and unmatched
        const matched: MatchedPair[] = []
        const unmatched: UnmatchedPair[] = []
        const processedPairs = new Set<string>()

        for (const [userId, data] of pairMap) {
            const pairKey = [userId, data.pairPickId].sort().join("|")

            if (processedPairs.has(pairKey)) continue
            processedPairs.add(pairKey)

            const reciprocal = pairMap.get(data.pairPickId)

            if (reciprocal && reciprocal.pairPickId === userId) {
                // Matched: both picked each other
                matched.push({
                    userA: {
                        userId,
                        name: data.name,
                        email: data.email,
                        pairReason: data.pairReason
                    },
                    userB: {
                        userId: data.pairPickId,
                        name: reciprocal.name,
                        email: reciprocal.email,
                        pairReason: reciprocal.pairReason
                    }
                })
            } else {
                // Unmatched: userId picked pairPickId but not reciprocated
                unmatched.push({
                    requester: {
                        userId,
                        name: data.name,
                        email: data.email,
                        pairReason: data.pairReason
                    },
                    requested: {
                        userId: data.pairPickId,
                        name:
                            pairPickNameMap.get(data.pairPickId) ??
                            "Unknown user",
                        email: pairPickEmailMap.get(data.pairPickId) ?? "—",
                        hasDifferentPairRequest:
                            reciprocal !== undefined &&
                            reciprocal.pairPickId !== userId
                    }
                })
            }
        }

        return {
            status: true,
            matched,
            unmatched,
            seasonLabel
        }
    } catch (error) {
        console.error("Error fetching season pairs:", error)
        return {
            status: false,
            message: "Something went wrong.",
            matched: [],
            unmatched: [],
            seasonLabel: ""
        }
    }
}

function isValidUserId(value: string): boolean {
    return typeof value === "string" && value.trim().length > 0
}

export const bustMatchedPair = withAction(
    async (userAId: string, userBId: string): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        if (
            !isValidUserId(userAId) ||
            !isValidUserId(userBId) ||
            userAId === userBId
        ) {
            return fail("Invalid pair selection.")
        }

        try {
            const actorId = await getSessionUserId()
            if (!actorId) {
                return fail("Not authenticated.")
            }

            const config = await getSeasonConfig()
            if (!config.seasonId) {
                return fail("No current season found.")
            }

            await db
                .update(signups)
                .set({
                    pair: false,
                    pair_pick: null
                })
                .where(
                    and(
                        eq(signups.season, config.seasonId),
                        inArray(signups.player, [userAId, userBId])
                    )
                )

            await logAuditEntry({
                userId: actorId,
                action: "update",
                entityType: "signups",
                summary: `Split matched pair (${userAId}, ${userBId}) for season ${config.seasonId}`
            })

            revalidatePath("/dashboard/review-pairs")
            return ok(undefined, "Pair has been split.")
        } catch (error) {
            console.error("Error busting matched pair:", error)
            return fail("Failed to split pair.")
        }
    }
)

export const bustUnmatchedPair = withAction(
    async (requesterId: string): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        if (!isValidUserId(requesterId)) {
            return fail("Invalid requester.")
        }

        try {
            const actorId = await getSessionUserId()
            if (!actorId) {
                return fail("Not authenticated.")
            }

            const config = await getSeasonConfig()
            if (!config.seasonId) {
                return fail("No current season found.")
            }

            await db
                .update(signups)
                .set({
                    pair: false,
                    pair_pick: null
                })
                .where(
                    and(
                        eq(signups.season, config.seasonId),
                        eq(signups.player, requesterId)
                    )
                )

            await logAuditEntry({
                userId: actorId,
                action: "update",
                entityType: "signups",
                summary: `Removed unmatched pair request by ${requesterId} for season ${config.seasonId}`
            })

            revalidatePath("/dashboard/review-pairs")
            return ok(undefined, "Pair request has been removed.")
        } catch (error) {
            console.error("Error busting unmatched pair:", error)
            return fail("Failed to remove pair request.")
        }
    }
)

export const completeUnmatchedPair = withAction(
    async (requesterId: string, requestedId: string): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        if (
            !isValidUserId(requesterId) ||
            !isValidUserId(requestedId) ||
            requesterId === requestedId
        ) {
            return fail("Invalid pair selection.")
        }

        try {
            const actorId = await getSessionUserId()
            if (!actorId) {
                return fail("Not authenticated.")
            }

            const config = await getSeasonConfig()
            if (!config.seasonId) {
                return fail("No current season found.")
            }

            const [requesterSignup] = await db
                .select({
                    pairPickId: signups.pair_pick
                })
                .from(signups)
                .where(
                    and(
                        eq(signups.season, config.seasonId),
                        eq(signups.player, requesterId)
                    )
                )
                .limit(1)

            const [requestedSignup] = await db
                .select({
                    pairPickId: signups.pair_pick
                })
                .from(signups)
                .where(
                    and(
                        eq(signups.season, config.seasonId),
                        eq(signups.player, requestedId)
                    )
                )
                .limit(1)

            if (!requesterSignup || !requestedSignup) {
                return fail(
                    "Both players must have signup records for the current season."
                )
            }

            if (requesterSignup.pairPickId !== requestedId) {
                return fail(
                    "Requester no longer points to this player. Refresh and try again."
                )
            }

            if (
                requestedSignup.pairPickId !== null &&
                requestedSignup.pairPickId !== requesterId
            ) {
                return fail(
                    "Requested player already has a different pair request."
                )
            }

            await db
                .update(signups)
                .set({
                    pair: true,
                    pair_pick: requesterId
                })
                .where(
                    and(
                        eq(signups.season, config.seasonId),
                        eq(signups.player, requestedId)
                    )
                )

            await logAuditEntry({
                userId: actorId,
                action: "update",
                entityType: "signups",
                summary: `Completed unmatched pair request (${requesterId} -> ${requestedId}) for season ${config.seasonId}`
            })

            revalidatePath("/dashboard/review-pairs")
            return ok(undefined, "Pair has been completed.")
        } catch (error) {
            console.error("Error completing unmatched pair:", error)
            return fail("Failed to complete pair.")
        }
    }
)
