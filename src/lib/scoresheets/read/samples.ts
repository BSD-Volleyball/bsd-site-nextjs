/**
 * samples.ts — record what the reader said, and learn what was saved.
 *
 * One row per team per game: what the readers concluded, and later what the
 * league actually saved for it. That is the running scorecard for the models.
 * The bake-off that chose them was 12 sheets; this measures every sheet after,
 * so a model that quietly gets worse, or a better one worth switching to, shows
 * up in the numbers rather than in a wrong standings table.
 *
 * Each row points at the photo it came from (`image_path`). Rows written by
 * the earlier reader point at a cropped box in the private bucket instead.
 *
 * Kept deliberately cheap and deliberately optional. A failure here never
 * affects a read: the scores are the point, the record is a by-product.
 */

import { and, eq, inArray, isNull, ne } from "drizzle-orm"

import { db } from "@/database/db"
import {
    matches,
    scoreSheetReads,
    scoreSheetScoreSamples
} from "@/database/schema"
import { logger } from "@/lib/logger"

import type { SheetRead } from "./read"

/** `${matchId}:${team}:${game}`, one team's score in one game. */
export function sampleId(
    matchId: number,
    team: "home" | "away",
    game: 1 | 2 | 3
): string {
    return `${matchId}:${team}:${game}`
}

/**
 * Store what the reader concluded for every game it saw played. Called after
 * a read; the confirmed answer arrives later, if it ever does. Blank games are
 * left out: there is no number to be right or wrong about.
 */
export async function storeScoreSamples(
    readId: number,
    read: SheetRead,
    photoPath: string
): Promise<void> {
    const rows: (typeof scoreSheetScoreSamples.$inferInsert)[] = []
    for (const match of read.matches) {
        match.games.forEach((game, index) => {
            if (game.blank) return
            for (const team of ["home", "away"] as const) {
                rows.push({
                    read_id: readId,
                    crop_id: sampleId(
                        match.matchId,
                        team,
                        (index + 1) as 1 | 2 | 3
                    ),
                    match_id: match.matchId,
                    image_path: photoPath,
                    predicted: team === "home" ? game.home : game.away,
                    predicted_confidence: String(game.confidence)
                })
            }
        })
    }
    if (rows.length === 0) return

    try {
        await db
            .insert(scoreSheetScoreSamples)
            .values(rows)
            .onConflictDoNothing()
    } catch (error) {
        logger.error("[scoresheets] Could not store score samples", {
            readId,
            error: error instanceof Error ? error.message : String(error)
        })
    }
}

/**
 * Label a night's samples with the scores that were actually saved.
 *
 * Reads the truth from the `matches` rows rather than from whatever the admin
 * typed, so a sample is only ever labelled with what the league now believes
 * the score was. Samples whose match still has no score stay unlabelled and
 * get another chance next time.
 */
export async function labelConfirmedSamples(
    matchIds: readonly number[]
): Promise<number> {
    if (matchIds.length === 0) return 0

    try {
        const played = await db
            .select({
                id: matches.id,
                home1: matches.home_set1_score,
                away1: matches.away_set1_score,
                home2: matches.home_set2_score,
                away2: matches.away_set2_score,
                home3: matches.home_set3_score,
                away3: matches.away_set3_score
            })
            .from(matches)
            .where(inArray(matches.id, [...matchIds]))

        const truth = new Map<string, number>()
        for (const match of played) {
            const sets: [number | null, number | null][] = [
                [match.home1, match.away1],
                [match.home2, match.away2],
                [match.home3, match.away3]
            ]
            sets.forEach(([home, away], index) => {
                if (home !== null)
                    truth.set(`${match.id}:home:${index + 1}`, home)
                if (away !== null)
                    truth.set(`${match.id}:away:${index + 1}`, away)
            })
        }
        if (truth.size === 0) return 0

        const pending = await db
            .select({
                id: scoreSheetScoreSamples.id,
                cropId: scoreSheetScoreSamples.crop_id
            })
            .from(scoreSheetScoreSamples)
            .where(
                and(
                    inArray(scoreSheetScoreSamples.match_id, [...matchIds]),
                    isNull(scoreSheetScoreSamples.confirmed)
                )
            )

        let labelled = 0
        for (const sample of pending) {
            const value = truth.get(sample.cropId)
            if (value === undefined) continue
            await db
                .update(scoreSheetScoreSamples)
                .set({ confirmed: value })
                .where(eq(scoreSheetScoreSamples.id, sample.id))
            labelled++
        }
        return labelled
    } catch (error) {
        logger.error("[scoresheets] Could not label score samples", {
            error: error instanceof Error ? error.message : String(error)
        })
        return 0
    }
}

/**
 * Mark the reads behind these matches as confirmed once their scores are
 * saved, so the score-sheet inbox stops listing them as awaiting review. The
 * save path knows which matches it wrote, not which read the admin filled
 * them from, so reads are found through their samples (each sample records
 * its read and match). Like labelling, this never affects the save.
 */
export async function confirmReadsForMatches(
    matchIds: readonly number[],
    userId: string
): Promise<number> {
    if (matchIds.length === 0) return 0
    try {
        const reads = await db
            .selectDistinct({ readId: scoreSheetScoreSamples.read_id })
            .from(scoreSheetScoreSamples)
            .where(inArray(scoreSheetScoreSamples.match_id, [...matchIds]))
        const readIds = reads
            .map((r) => r.readId)
            .filter((id): id is number => id !== null)
        if (readIds.length === 0) return 0

        const confirmed = await db
            .update(scoreSheetReads)
            .set({
                status: "confirmed",
                confirmed_at: new Date(),
                confirmed_by: userId
            })
            .where(
                and(
                    inArray(scoreSheetReads.id, readIds),
                    ne(scoreSheetReads.status, "confirmed")
                )
            )
            .returning({ id: scoreSheetReads.id })
        return confirmed.length
    } catch (error) {
        logger.error("[scoresheets] Could not confirm reads", {
            error: error instanceof Error ? error.message : String(error)
        })
        return 0
    }
}
