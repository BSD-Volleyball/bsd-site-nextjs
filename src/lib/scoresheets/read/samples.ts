/**
 * samples.ts — keep the cropped score boxes, and learn what they said.
 *
 * Every sheet an admin confirms is free training data: an image of two
 * handwritten digits, and the number a human agreed they were. Enough of
 * these and a small classifier can be trained on how this league's referees
 * actually write, which is the way off a hosted model and onto something that
 * costs nothing and runs in-process.
 *
 * Kept deliberately cheap and deliberately optional. A failure here never
 * affects a read: the scores are the point, the corpus is a by-product.
 */

import { and, eq, inArray, isNull } from "drizzle-orm"

import { db } from "@/database/db"
import {
    matches,
    scoreSheetReads,
    scoreSheetScoreSamples
} from "@/database/schema"
import { logger } from "@/lib/logger"
import { putR2Object } from "@/lib/r2"

import type { ScoreCrop } from "./crops"
import type { SheetRead } from "./read"

const PREFIX = "scoresheet-samples"

/** Which game and side a crop id refers to. */
function parseCropId(
    id: string
): { matchId: number; team: "home" | "away"; game: 1 | 2 | 3 } | null {
    const [matchId, team, game] = id.split(":")
    const parsedMatch = Number.parseInt(matchId, 10)
    const parsedGame = Number.parseInt(game, 10)
    if (!Number.isInteger(parsedMatch)) return null
    if (team !== "home" && team !== "away") return null
    if (parsedGame < 1 || parsedGame > 3) return null
    return {
        matchId: parsedMatch,
        team,
        game: parsedGame as 1 | 2 | 3
    }
}

/** What the reader made of a given crop, for recording alongside it. */
function predictionFor(read: SheetRead, cropId: string): number | null {
    const parsed = parseCropId(cropId)
    if (!parsed) return null
    const match = read.matches.find((m) => m.matchId === parsed.matchId)
    const game = match?.games[parsed.game - 1]
    if (!game) return null
    return parsed.team === "home" ? game.home : game.away
}

/**
 * Store each cropped box and what the reader thought it said. Called after a
 * read; the confirmed answer arrives later, if it ever does.
 */
export async function storeScoreSamples(
    readId: number,
    read: SheetRead,
    crops: readonly ScoreCrop[]
): Promise<void> {
    if (crops.length === 0) return

    try {
        const rows: (typeof scoreSheetScoreSamples.$inferInsert)[] = []
        for (const crop of crops) {
            const key = `${PREFIX}/${readId}/${crop.id.replace(/:/g, "_")}.png`
            await putR2Object({
                key,
                body: Buffer.from(crop.png),
                contentType: "image/png"
            })
            rows.push({
                read_id: readId,
                crop_id: crop.id,
                match_id: crop.matchId,
                image_path: key,
                predicted: predictionFor(read, crop.id)
            })
        }

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

/** Mark a read as confirmed once its scores have been saved. */
export async function markReadConfirmed(
    readId: number,
    userId: string
): Promise<void> {
    await db
        .update(scoreSheetReads)
        .set({
            status: "confirmed",
            confirmed_at: new Date(),
            confirmed_by: userId
        })
        .where(eq(scoreSheetReads.id, readId))
}
