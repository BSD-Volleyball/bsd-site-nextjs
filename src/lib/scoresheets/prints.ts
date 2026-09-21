/**
 * prints.ts — remember what each printed sheet's geometry was.
 *
 * `generate.ts` builds a PDF on demand and keeps nothing, so a photo taken
 * after the schedule changed would otherwise be read with a layout that was
 * never printed. `buildSheetGeometry()` depends on very little — the ordered
 * match ids, how many there are, and the event type — so recording those few
 * facts at generation time reproduces the printed page exactly.
 *
 * Keyed by the tag encoded in the page's machine-readable QR. Regenerating a
 * sheet overwrites the row: a reprint means the earlier copy is obsolete, and
 * a photo of that older copy is caught downstream by comparing the block count
 * the image actually shows against the ids recorded here.
 */

import { and, eq } from "drizzle-orm"

import { db } from "@/database/db"
import { scoreSheetPrints } from "@/database/schema"
import { logger } from "@/lib/logger"

import { sheetTag, TEMPLATE_VERSION } from "./sheet-config"
import type { SheetEventType, SheetNight } from "./types"

export interface ScoreSheetPrint {
    tag: string
    matchDate: string
    court: number | null
    templateVersion: number
    eventType: SheetEventType
    /** Ordered exactly as the blocks were printed down the page. */
    matchIds: number[]
    generatedAt: Date
}

/**
 * Upsert one row per court of a night. Never throws: a bookkeeping failure
 * must not break a score-sheet download or the coverage digest email, the
 * same discipline the digest already applies to its attachment.
 */
export async function recordScoreSheetPrints(
    night: SheetNight,
    seasonId: number,
    userId: string | null
): Promise<void> {
    if (night.courts.length === 0) return

    try {
        for (const sheet of night.courts) {
            const values = {
                tag: sheetTag(night, sheet.court),
                season_id: seasonId,
                match_date: night.date,
                court: sheet.court,
                template_version: TEMPLATE_VERSION,
                event_type: night.eventType,
                match_ids: sheet.matches.map((m) => m.matchId),
                generated_at: new Date(),
                generated_by: userId
            }

            await db
                .insert(scoreSheetPrints)
                .values(values)
                .onConflictDoUpdate({
                    target: scoreSheetPrints.tag,
                    set: {
                        season_id: values.season_id,
                        match_date: values.match_date,
                        court: values.court,
                        template_version: values.template_version,
                        event_type: values.event_type,
                        match_ids: values.match_ids,
                        generated_at: values.generated_at,
                        generated_by: values.generated_by
                    }
                })
        }
    } catch (error) {
        logger.error("[scoresheets] Failed to record print geometry", {
            date: night.date,
            error: error instanceof Error ? error.message : String(error)
        })
    }
}

function toPrint(row: typeof scoreSheetPrints.$inferSelect): ScoreSheetPrint {
    return {
        tag: row.tag,
        matchDate: row.match_date,
        court: row.court,
        templateVersion: row.template_version,
        eventType: row.event_type as SheetEventType,
        matchIds: row.match_ids,
        generatedAt: row.generated_at
    }
}

/** The reader's entry point: tag from the photo's QR to printed geometry. */
export async function findScoreSheetPrint(
    tag: string
): Promise<ScoreSheetPrint | null> {
    const [row] = await db
        .select()
        .from(scoreSheetPrints)
        .where(eq(scoreSheetPrints.tag, tag))
        .limit(1)
    return row ? toPrint(row) : null
}

/** Every sheet printed for a night, for the review inbox. */
export async function listScoreSheetPrints(
    seasonId: number,
    date: string
): Promise<ScoreSheetPrint[]> {
    const rows = await db
        .select()
        .from(scoreSheetPrints)
        .where(
            and(
                eq(scoreSheetPrints.season_id, seasonId),
                eq(scoreSheetPrints.match_date, date)
            )
        )
    return rows.map(toPrint)
}
