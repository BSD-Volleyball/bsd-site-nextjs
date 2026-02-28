import "server-only"
import { db } from "@/database/db"
import { playerRatings, seasons, users } from "@/database/schema"
import { and, desc, eq, inArray, lte } from "drizzle-orm"
import {
    getEmptyPlayerRatingAverages,
    type PlayerRatingsSectionData
} from "@/lib/player-ratings-shared"

function formatSeasonLabel(seasonName: string, seasonYear: number): string {
    return `${seasonName.charAt(0).toUpperCase() + seasonName.slice(1)} ${seasonYear}`
}

function average(values: Array<number | null>): number | null {
    const validValues = values.filter(
        (value): value is number => value !== null
    )
    if (validValues.length === 0) {
        return null
    }

    const total = validValues.reduce((sum, value) => sum + value, 0)
    return Math.round((total / validValues.length) * 10) / 10
}

export async function getPlayerRatingsSectionData(
    playerId: string,
    currentSeasonId: number | null,
    viewerUserId: string | null
): Promise<PlayerRatingsSectionData> {
    const seasonQuery = db
        .select({
            id: seasons.id,
            seasonName: seasons.season,
            seasonYear: seasons.year
        })
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(4)

    const seasonWindowRows = currentSeasonId
        ? await seasonQuery.where(lte(seasons.id, currentSeasonId))
        : await seasonQuery

    if (seasonWindowRows.length === 0) {
        return {
            averages: getEmptyPlayerRatingAverages(),
            sharedNotes: [],
            privateNotes: []
        }
    }

    const seasonWindowIds = seasonWindowRows.map((season) => season.id)

    const ratingRows = await db
        .select({
            seasonId: playerRatings.season,
            evaluatorId: playerRatings.evaluator,
            overall: playerRatings.overall,
            passing: playerRatings.passing,
            setting: playerRatings.setting,
            hitting: playerRatings.hitting,
            serving: playerRatings.serving,
            sharedNote: playerRatings.shared_notes,
            privateNote: playerRatings.private_notes,
            updatedAt: playerRatings.updated_at
        })
        .from(playerRatings)
        .where(
            and(
                eq(playerRatings.player, playerId),
                inArray(playerRatings.season, seasonWindowIds)
            )
        )
        .orderBy(desc(playerRatings.season), desc(playerRatings.updated_at))

    const seasonLabelById = new Map(
        seasonWindowRows.map((season) => [
            season.id,
            formatSeasonLabel(season.seasonName, season.seasonYear)
        ])
    )

    const evaluatorIds = [...new Set(ratingRows.map((row) => row.evaluatorId))]

    const evaluatorNameById = new Map<string, string>()
    if (evaluatorIds.length > 0) {
        const evaluatorRows = await db
            .select({
                id: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name
            })
            .from(users)
            .where(inArray(users.id, evaluatorIds))

        for (const row of evaluatorRows) {
            const displayName = `${row.preferredName || row.firstName} ${row.lastName}`
            evaluatorNameById.set(row.id, displayName)
        }
    }

    return {
        averages: {
            overall: average(ratingRows.map((row) => row.overall)),
            passing: average(ratingRows.map((row) => row.passing)),
            setting: average(ratingRows.map((row) => row.setting)),
            hitting: average(ratingRows.map((row) => row.hitting)),
            serving: average(ratingRows.map((row) => row.serving)),
            sampleCount: ratingRows.length,
            seasonLabels: seasonWindowRows.map((season) =>
                formatSeasonLabel(season.seasonName, season.seasonYear)
            )
        },
        sharedNotes: ratingRows
            .filter((row) => !!row.sharedNote?.trim())
            .map((row) => ({
                seasonId: row.seasonId,
                seasonLabel:
                    seasonLabelById.get(row.seasonId) ||
                    `Season ${row.seasonId}`,
                note: row.sharedNote!.trim(),
                evaluatorId: row.evaluatorId,
                evaluatorName:
                    evaluatorNameById.get(row.evaluatorId) || row.evaluatorId,
                updatedAt: row.updatedAt
            })),
        privateNotes: ratingRows
            .filter(
                (row) =>
                    !!row.privateNote?.trim() &&
                    !!viewerUserId &&
                    row.evaluatorId === viewerUserId
            )
            .map((row) => ({
                seasonId: row.seasonId,
                seasonLabel:
                    seasonLabelById.get(row.seasonId) ||
                    `Season ${row.seasonId}`,
                note: row.privateNote!.trim(),
                evaluatorId: row.evaluatorId,
                evaluatorName:
                    evaluatorNameById.get(row.evaluatorId) || row.evaluatorId,
                updatedAt: row.updatedAt
            }))
    }
}
