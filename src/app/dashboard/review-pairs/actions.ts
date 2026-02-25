"use server"

import { db } from "@/database/db"
import { users, signups } from "@/database/schema"
import { eq, and, isNotNull, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { isAdminOrDirectorBySession } from "@/lib/rbac"

export interface PairUser {
    name: string
    pairReason: string | null
}

export interface MatchedPair {
    userA: PairUser
    userB: PairUser
}

export interface UnmatchedPair {
    requester: PairUser
    requested: { name: string }
}

async function checkAdminAccess(): Promise<boolean> {
    return isAdminOrDirectorBySession()
}

function buildDisplayName(
    firstName: string,
    lastName: string,
    preferredName: string | null
): string {
    const preferred = preferredName ? ` (${preferredName})` : ""
    return `${firstName}${preferred} ${lastName}`
}

export async function getSeasonPairs(): Promise<{
    status: boolean
    message?: string
    matched: MatchedPair[]
    unmatched: UnmatchedPair[]
    seasonLabel: string
}> {
    const hasAccess = await checkAdminAccess()
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
                preferredName: users.preffered_name
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
            }
        >()

        const allPairPickIds = new Set<string>()

        for (const row of pairRows) {
            const pickId = row.pairPickId!
            pairMap.set(row.userId, {
                pairPickId: pickId,
                pairReason: row.pairReason,
                name: buildDisplayName(
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

        // Names we already know from pairMap
        for (const [userId, data] of pairMap) {
            pairPickNameMap.set(userId, data.name)
        }

        // Fetch names for users not in pairMap
        if (missingUserIds.length > 0) {
            const missingUsers = await db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preffered_name
                })
                .from(users)
                .where(inArray(users.id, missingUserIds))

            for (const u of missingUsers) {
                pairPickNameMap.set(
                    u.id,
                    buildDisplayName(u.firstName, u.lastName, u.preferredName)
                )
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
                        name: data.name,
                        pairReason: data.pairReason
                    },
                    userB: {
                        name: reciprocal.name,
                        pairReason: reciprocal.pairReason
                    }
                })
            } else {
                // Unmatched: userId picked pairPickId but not reciprocated
                unmatched.push({
                    requester: {
                        name: data.name,
                        pairReason: data.pairReason
                    },
                    requested: {
                        name:
                            pairPickNameMap.get(data.pairPickId) ??
                            "Unknown user"
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
