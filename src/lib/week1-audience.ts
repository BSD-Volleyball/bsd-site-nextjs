import "server-only"

import { and, desc, eq, lt, ne } from "drizzle-orm"
import { db } from "@/database/db"
import { divisions, drafts, seasons, teams } from "@/database/schema"
import {
    resolveWeek1Audience,
    type Week1Audience,
    type Week1DraftSeason
} from "@/app/dashboard/create-week-1/week1-priority"

/**
 * Which week 1 callout a player should see, from their own draft history.
 * Mirrors the Create Week 1 bucketing for the buckets knowable per player
 * (new / long gap / dropped division / bubble); the missing-tryout bucket is
 * applied live by the form from the player's week 2/3 selections.
 */
export async function loadWeek1Audience(
    userId: string,
    seasonId: number
): Promise<Week1Audience> {
    const draftRows = await db
        .select({
            seasonId: seasons.id,
            divisionLevel: divisions.level
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .where(eq(drafts.user, userId))
        .orderBy(desc(seasons.id), drafts.overall)

    // One record per season, most recent first (same shape the admin page uses).
    const history: Week1DraftSeason[] = []
    for (const row of draftRows) {
        if (!history.some((record) => record.seasonId === row.seasonId)) {
            history.push(row)
        }
    }

    const isBubblePlayer =
        history.length > 0
            ? await isPreviousSeasonBubblePlayer(userId, seasonId)
            : false

    return resolveWeek1Audience({
        hasAnyDraft: history.length > 0,
        mostRecentDraft: history[0] ?? null,
        secondMostRecentDraft: history[1] ?? null,
        currentSeasonId: seasonId,
        isBubblePlayer,
        missesTryout2Or3: false
    })
}

/**
 * Bubble player = drafted in round 1 of a non-AA division in the most recent
 * season (before this one) that has any drafts.
 */
async function isPreviousSeasonBubblePlayer(
    userId: string,
    seasonId: number
): Promise<boolean> {
    const [previousDraftSeason] = await db
        .select({ seasonId: seasons.id })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .where(lt(seasons.id, seasonId))
        .orderBy(desc(seasons.id))
        .limit(1)

    if (!previousDraftSeason) {
        return false
    }

    const [bubbleRow] = await db
        .select({ userId: drafts.user })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .where(
            and(
                eq(teams.season, previousDraftSeason.seasonId),
                eq(drafts.round, 1),
                eq(drafts.user, userId),
                ne(divisions.name, "AA")
            )
        )
        .limit(1)

    return bubbleRow !== undefined
}
