"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import { withAction, ok, fail } from "@/next/action-helpers"
import { db } from "@/database/db"
import { signups } from "@/database/schema"
import { eq, and, isNull, inArray, TransactionRollbackError } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"
import { getSessionUserId, isAdminOrDirectorBySession } from "@/next/session"
import { revalidatePath } from "next/cache"

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
            revalidateCalendarFeeds()
            return ok(undefined, "Pair has been split.")
        } catch (error) {
            logger.error("Error busting matched pair", undefined, error)
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
            revalidateCalendarFeeds()
            return ok(undefined, "Pair request has been removed.")
        } catch (error) {
            logger.error("Error busting unmatched pair", undefined, error)
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
            revalidateCalendarFeeds()
            return ok(undefined, "Pair has been completed.")
        } catch (error) {
            logger.error("Error completing unmatched pair", undefined, error)
            return fail("Failed to complete pair.")
        }
    }
)

export const assignPairPartner = withAction(
    async (requesterId: string, partnerId: string): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        if (
            !isValidUserId(requesterId) ||
            !isValidUserId(partnerId) ||
            requesterId === partnerId
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
                    pair: signups.pair,
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

            const [partnerSignup] = await db
                .select({
                    pairPickId: signups.pair_pick
                })
                .from(signups)
                .where(
                    and(
                        eq(signups.season, config.seasonId),
                        eq(signups.player, partnerId)
                    )
                )
                .limit(1)

            if (!requesterSignup || !partnerSignup) {
                return fail(
                    "Both players must have signup records for the current season."
                )
            }

            if (requesterSignup.pairPickId !== null) {
                return fail(
                    "Requester already has a pair pick. Refresh and try again."
                )
            }

            if (partnerSignup.pairPickId !== null) {
                return fail(
                    "Selected player already has a pair request. Refresh and try again."
                )
            }

            // Both sides or neither, and only while both are still unpaired:
            // the checks above can race another reviewer pairing one of them.
            const seasonId = config.seasonId
            const paired = await db
                .transaction(async (tx) => {
                    const pairWith = (player: string, partner: string) =>
                        tx
                            .update(signups)
                            .set({ pair: true, pair_pick: partner })
                            .where(
                                and(
                                    eq(signups.season, seasonId),
                                    eq(signups.player, player),
                                    isNull(signups.pair_pick)
                                )
                            )
                            .returning({ id: signups.id })
                    const first = await pairWith(requesterId, partnerId)
                    const second = await pairWith(partnerId, requesterId)
                    if (first.length === 0 || second.length === 0) {
                        tx.rollback()
                    }
                    return true
                })
                .catch((error) => {
                    if (error instanceof TransactionRollbackError) return false
                    throw error
                })
            if (!paired) {
                return fail(
                    "One of these players was just paired by someone else. Refresh and try again."
                )
            }

            await logAuditEntry({
                userId: actorId,
                action: "update",
                entityType: "signups",
                summary: `Assigned pair partner (${requesterId} <-> ${partnerId}) for season ${config.seasonId}`
            })

            revalidatePath("/dashboard/review-pairs")
            revalidateCalendarFeeds()
            return ok(undefined, "Pair has been assigned.")
        } catch (error) {
            logger.error("Error assigning pair partner", undefined, error)
            return fail("Failed to assign pair.")
        }
    }
)
