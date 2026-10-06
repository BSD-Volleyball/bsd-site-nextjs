import "server-only"

import { formatSeasonLabel } from "@/lib/season-utils"
import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { formatPlayerName } from "@/lib/utils"
import { db } from "@/database/db"
import { users, signups } from "@/database/schema"
import { eq, and, or, isNull, isNotNull, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { PAIR_REQUIRED_AGE_GROUP } from "@/lib/age-groups"
import { isAdminOrDirectorBySession } from "@/next/session"

export interface PairUser {
    userId: string
    name: string
    email: string
    pairReason: string | null
    // League rules require 14-15 year olds to be paired.
    pairRequired: boolean
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
        pairRequired: boolean
    }
}

export interface PairCandidate {
    userId: string
    name: string
    email: string
    pairRequired: boolean
}

export const getSeasonPairs = withAction(
    async (): Promise<
        ActionResult<{
            matched: MatchedPair[]
            unmatched: UnmatchedPair[]
            incomplete: PairUser[]
            candidates: PairCandidate[]
            seasonLabel: string
        }>
    > => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const config = await getSeasonConfig()

            if (!config.seasonId) {
                return fail("No current season found.")
            }

            const seasonLabel = formatSeasonLabel(config)

            // Fetch all signups for the season. Rows with a pair_pick feed the
            // matched/unmatched buckets; rows with pair = true but no pick feed
            // the incomplete bucket; rows with no pick at all are candidates an
            // admin may assign as a partner.
            const seasonRows = await db
                .select({
                    userId: signups.player,
                    age: signups.age,
                    pair: signups.pair,
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
                        or(eq(signups.pair, true), isNotNull(signups.pair_pick))
                    )
                )

            const pairRows = seasonRows.filter((row) => row.pairPickId !== null)

            // Signed-up players who want to pair but never named a partner.
            const incomplete: PairUser[] = seasonRows
                .filter((row) => row.pair === true && row.pairPickId === null)
                .map((row) => ({
                    userId: row.userId,
                    name: formatPlayerName(
                        row.firstName,
                        row.lastName,
                        row.preferredName
                    ),
                    email: row.email,
                    pairReason: row.pairReason,
                    pairRequired: row.age === PAIR_REQUIRED_AGE_GROUP
                }))
                .sort((a, b) => a.name.localeCompare(b.name))

            // Every signed-up player with no outgoing pair pick is assignable.
            const candidateRows = await db
                .select({
                    userId: signups.player,
                    age: signups.age,
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
                        isNull(signups.pair_pick)
                    )
                )

            const candidates: PairCandidate[] = candidateRows
                .map((row) => ({
                    userId: row.userId,
                    name: formatPlayerName(
                        row.firstName,
                        row.lastName,
                        row.preferredName
                    ),
                    email: row.email,
                    pairRequired: row.age === PAIR_REQUIRED_AGE_GROUP
                }))
                .sort((a, b) => a.name.localeCompare(b.name))

            // Every signed-up player shown on this page appears in seasonRows or
            // candidateRows, so between them we know who is in the pair-required
            // (14-15) age group. Requested players with no signup stay unflagged.
            const pairRequiredIds = new Set<string>()
            for (const row of seasonRows) {
                if (row.age === PAIR_REQUIRED_AGE_GROUP) {
                    pairRequiredIds.add(row.userId)
                }
            }
            for (const row of candidateRows) {
                if (row.age === PAIR_REQUIRED_AGE_GROUP) {
                    pairRequiredIds.add(row.userId)
                }
            }

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
                        formatPlayerName(
                            u.firstName,
                            u.lastName,
                            u.preferredName
                        )
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
                            pairReason: data.pairReason,
                            pairRequired: pairRequiredIds.has(userId)
                        },
                        userB: {
                            userId: data.pairPickId,
                            name: reciprocal.name,
                            email: reciprocal.email,
                            pairReason: reciprocal.pairReason,
                            pairRequired: pairRequiredIds.has(data.pairPickId)
                        }
                    })
                } else {
                    // Unmatched: userId picked pairPickId but not reciprocated
                    unmatched.push({
                        requester: {
                            userId,
                            name: data.name,
                            email: data.email,
                            pairReason: data.pairReason,
                            pairRequired: pairRequiredIds.has(userId)
                        },
                        requested: {
                            userId: data.pairPickId,
                            name:
                                pairPickNameMap.get(data.pairPickId) ??
                                "Unknown user",
                            email: pairPickEmailMap.get(data.pairPickId) ?? "—",
                            hasDifferentPairRequest:
                                reciprocal !== undefined &&
                                reciprocal.pairPickId !== userId,
                            pairRequired: pairRequiredIds.has(data.pairPickId)
                        }
                    })
                }
            }

            return ok({
                matched,
                unmatched,
                incomplete,
                candidates,
                seasonLabel
            })
        } catch (error) {
            logger.error("Error fetching season pairs", undefined, error)
            return fail("Something went wrong.")
        }
    }
)
