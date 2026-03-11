import { and, desc, eq, inArray, isNotNull } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    drafts,
    evaluations,
    playerRatings,
    seasons,
    teams,
    users
} from "@/database/schema"

const DEFAULT_SCORE = 200

/**
 * Returns a rating-based placement score for each userId using current-season
 * player ratings: `((6 - avgOverall) * 50) + 1`, where director ratings count
 * double. Users with no ratings are omitted from the result.
 */
export async function fetchRatingBasedScores(
    userIds: string[],
    seasonId: number
): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map()

    const ratingRows = await db
        .select({
            playerId: playerRatings.player,
            overall: playerRatings.overall,
            evaluatorRole: users.role
        })
        .from(playerRatings)
        .innerJoin(users, eq(playerRatings.evaluator, users.id))
        .where(
            and(
                eq(playerRatings.season, seasonId),
                inArray(playerRatings.player, userIds),
                isNotNull(playerRatings.overall)
            )
        )

    const aggregates = new Map<
        string,
        { weightedSum: number; totalWeight: number }
    >()
    for (const row of ratingRows) {
        if (row.overall === null) continue
        const weight = row.evaluatorRole === "director" ? 2 : 1
        const current = aggregates.get(row.playerId) || {
            weightedSum: 0,
            totalWeight: 0
        }
        current.weightedSum += row.overall * weight
        current.totalWeight += weight
        aggregates.set(row.playerId, current)
    }

    const result = new Map<string, number>()
    for (const [playerId, agg] of aggregates.entries()) {
        result.set(playerId, (6 - agg.weightedSum / agg.totalWeight) * 50 + 1)
    }
    return result
}

/**
 * Returns a placement score for each userId.
 *
 * Algorithm:
 * 1. Use `drafts.overall` from the player's most recent season (primary).
 * 2. For players with no draft history, use current-season player ratings:
 *    `((6 - avgOverall) * 50) + 1`, where director ratings count double.
 * 3. For players still missing ratings, use current-season evaluations:
 *    `(avgDivisionLevel - 1) * 50` (fallback).
 * 4. Default to 200 if neither source has data.
 */
export async function fetchPlayerScores(
    userIds: string[],
    seasonId: number
): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map()

    const draftRows = await db
        .select({
            userId: drafts.user,
            overall: drafts.overall
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .where(inArray(drafts.user, userIds))
        .orderBy(desc(seasons.id))

    const mostRecentByUser = new Map<string, number>()
    for (const row of draftRows) {
        if (!mostRecentByUser.has(row.userId)) {
            mostRecentByUser.set(row.userId, row.overall)
        }
    }

    const usersWithoutDraft = userIds.filter((id) => !mostRecentByUser.has(id))
    const ratingScoreByUser = new Map<string, number>()
    const evalScoreByUser = new Map<string, number>()

    if (usersWithoutDraft.length > 0) {
        const ratingRows = await db
            .select({
                playerId: playerRatings.player,
                overall: playerRatings.overall,
                evaluatorRole: users.role
            })
            .from(playerRatings)
            .innerJoin(users, eq(playerRatings.evaluator, users.id))
            .where(
                and(
                    eq(playerRatings.season, seasonId),
                    inArray(playerRatings.player, usersWithoutDraft),
                    isNotNull(playerRatings.overall)
                )
            )

        const ratingAggregates = new Map<
            string,
            { weightedSum: number; totalWeight: number }
        >()
        for (const row of ratingRows) {
            if (row.overall === null) continue
            const weight = row.evaluatorRole === "director" ? 2 : 1
            const current = ratingAggregates.get(row.playerId) || {
                weightedSum: 0,
                totalWeight: 0
            }
            current.weightedSum += row.overall * weight
            current.totalWeight += weight
            ratingAggregates.set(row.playerId, current)
        }

        for (const [playerId, agg] of ratingAggregates.entries()) {
            const average = agg.weightedSum / agg.totalWeight
            ratingScoreByUser.set(playerId, (6 - average) * 50 + 1)
        }

        const usersWithoutRating = usersWithoutDraft.filter(
            (id) => !ratingScoreByUser.has(id)
        )

        if (usersWithoutRating.length > 0) {
            const evalRows = await db
                .select({
                    playerId: evaluations.player,
                    divisionLevel: divisions.level
                })
                .from(evaluations)
                .innerJoin(divisions, eq(evaluations.division, divisions.id))
                .where(
                    and(
                        eq(evaluations.season, seasonId),
                        inArray(evaluations.player, usersWithoutRating)
                    )
                )

            const aggregates = new Map<string, { sum: number; count: number }>()
            for (const row of evalRows) {
                const current = aggregates.get(row.playerId) || {
                    sum: 0,
                    count: 0
                }
                current.sum += row.divisionLevel
                current.count += 1
                aggregates.set(row.playerId, current)
            }
            for (const [playerId, agg] of aggregates.entries()) {
                evalScoreByUser.set(playerId, (agg.sum / agg.count - 1) * 50)
            }
        }
    }

    const result = new Map<string, number>()
    for (const userId of userIds) {
        result.set(
            userId,
            mostRecentByUser.get(userId) ??
                ratingScoreByUser.get(userId) ??
                evalScoreByUser.get(userId) ??
                DEFAULT_SCORE
        )
    }
    return result
}
