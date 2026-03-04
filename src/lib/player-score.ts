import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    drafts,
    evaluations,
    seasons,
    teams
} from "@/database/schema"

const DEFAULT_SCORE = 200

/**
 * Returns a placement score for each userId.
 *
 * Algorithm:
 * 1. Use `drafts.overall` from the player's most recent season (primary).
 * 2. For players with no draft history, use current-season evaluations:
 *    `(avgDivisionLevel - 1) * 50` (fallback).
 * 3. Default to 200 if neither source has data.
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
    const evalScoreByUser = new Map<string, number>()

    if (usersWithoutDraft.length > 0) {
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
                    inArray(evaluations.player, usersWithoutDraft)
                )
            )

        const aggregates = new Map<string, { sum: number; count: number }>()
        for (const row of evalRows) {
            const current = aggregates.get(row.playerId) || { sum: 0, count: 0 }
            current.sum += row.divisionLevel
            current.count += 1
            aggregates.set(row.playerId, current)
        }
        for (const [playerId, agg] of aggregates.entries()) {
            evalScoreByUser.set(playerId, (agg.sum / agg.count - 1) * 50)
        }
    }

    const result = new Map<string, number>()
    for (const userId of userIds) {
        result.set(
            userId,
            mostRecentByUser.get(userId) ??
                evalScoreByUser.get(userId) ??
                DEFAULT_SCORE
        )
    }
    return result
}
